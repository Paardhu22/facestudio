import { create } from 'zustand';

import { isDefaultOutput } from '@/lib/cropping/output';
import {
  DEFAULT_ADJUSTMENTS,
  isNeutralAdjustments,
  normalizeAdjustments,
} from '@/lib/image-processing/adjustment-spec';
import type { CropRegion, ImageAdjustments, ImageEdit, ImageId, OutputSettings } from '@/types/domain';

/**
 * Non-destructive edit state (SKILLS.md §C.5, §D.5). Holds each image's whole edit (adjustments, crop, output settings) as one
 * snapshot, only for images whose edit differs from the defaults (an absent key means "unedited"), plus the undo/redo history
 * of logical operations. History stores small snapshots only: never pixels, blobs, or object URLs.
 *
 * Rules:
 * - A continuous gesture (slider drag, crop drag) updates live state and commits ONE operation on release (`commitGesture`).
 * - A batch change ("apply to selected/all", reset) is one operation covering every affected image.
 * - Anything that changes a value marks those images dirty so the sync hook can persist them.
 */

export const HISTORY_LIMIT = 200;

export const DEFAULT_EDIT: ImageEdit = Object.freeze({ adjustments: DEFAULT_ADJUSTMENTS, crop: null, output: null });

export type EditChange = { id: ImageId; before: ImageEdit; after: ImageEdit };
export type EditOperation = { label: string; changes: readonly EditChange[] };

export type SyncState = 'idle' | 'saving' | 'error';

type EditState = {
  edits: Readonly<Record<ImageId, ImageEdit>>;
  undoStack: readonly EditOperation[];
  redoStack: readonly EditOperation[];
  /** The open gesture, if any: remembers the edit as it was before the gesture began. */
  gesture: { id: ImageId; before: ImageEdit } | null;
  /** Images changed since the last successful save. */
  dirty: ReadonlySet<ImageId>;
  syncState: SyncState;
  /** Hold-to-compare: show the unadjusted, uncropped image. Transient UI state. */
  comparing: boolean;
};

export type EditPatch = Partial<ImageEdit>;

type EditActions = {
  /** Replace everything with the server's saved edits (initial load). Clears history. */
  hydrate: (edits: Readonly<Record<ImageId, ImageEdit>>) => void;
  /** Live adjustment update during a gesture or a typed value; does not touch history. */
  setLive: (id: ImageId, patch: Partial<ImageAdjustments>) => void;
  /** Live crop update (a drag, a typed number). `null` removes the crop. Does not touch history until `commitGesture`. */
  setCropLive: (id: ImageId, crop: CropRegion | null) => void;
  /** Live output-settings update. `null` restores the defaults. */
  setOutputLive: (id: ImageId, output: OutputSettings | null) => void;
  /** End the current gesture and record it as one undoable operation (no-op if nothing changed). */
  commitGesture: (label: string) => void;
  /** Change one image's crop as a single undoable operation. */
  setCrop: (id: ImageId, crop: CropRegion | null, label: string) => void;
  /** Change one image's output settings as a single undoable operation. */
  setOutput: (id: ImageId, output: OutputSettings | null, label: string) => void;
  /** Set the same adjustments on many images as one undoable operation. */
  applyTo: (ids: readonly ImageId[], adjustments: ImageAdjustments, label: string) => void;
  /** Set (possibly different) crops on many images as one undoable operation. */
  applyCrops: (entries: readonly { id: ImageId; crop: CropRegion | null }[], label: string) => void;
  /** Set the same output settings on many images as one undoable operation. */
  applyOutputTo: (ids: readonly ImageId[], output: OutputSettings | null, label: string) => void;
  undo: () => void;
  redo: () => void;
  /** Forget removed images, and clear history (deleting images is not undoable). */
  pruneImages: (ids: readonly ImageId[]) => void;
  /** Mark these images saved, unless they changed again while the save was in flight. */
  markSaved: (saved: Readonly<Record<ImageId, ImageEdit>>) => void;
  setSyncState: (state: SyncState) => void;
  setComparing: (comparing: boolean) => void;
};

const sameAdjustments = (a: ImageAdjustments, b: ImageAdjustments): boolean =>
  a.exposure === b.exposure &&
  a.temperature === b.temperature &&
  a.tint === b.tint &&
  a.saturation === b.saturation &&
  a.brightness === b.brightness;

// Crops and output settings are small plain objects, so a structural comparison by value is cheap and exact.
const sameJson = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

export const editsEqual = (a: ImageEdit, b: ImageEdit): boolean =>
  sameAdjustments(a.adjustments, b.adjustments) && sameJson(a.crop, b.crop) && sameJson(a.output, b.output);

export const isNeutralEdit = (edit: ImageEdit): boolean =>
  isNeutralAdjustments(edit.adjustments) &&
  edit.crop === null &&
  (edit.output === null || isDefaultOutput(edit.output));

/** The canonical form of an edit: output settings equal to the defaults are the same thing as "no override" (`null`). */
const canonical = (edit: ImageEdit): ImageEdit =>
  edit.output !== null && isDefaultOutput(edit.output) ? { ...edit, output: null } : edit;

/** Immutable write: a fully default edit removes the key, so absent means unedited. */
function withEdit(
  current: Readonly<Record<ImageId, ImageEdit>>,
  id: ImageId,
  next: ImageEdit,
): Record<ImageId, ImageEdit> {
  const copy = { ...current };
  if (isNeutralEdit(next)) delete copy[id];
  else copy[id] = next;
  return copy;
}

const addDirty = (dirty: ReadonlySet<ImageId>, ids: Iterable<ImageId>): Set<ImageId> => {
  const next = new Set(dirty);
  for (const id of ids) next.add(id);
  return next;
};

const pushHistory = (stack: readonly EditOperation[], op: EditOperation): EditOperation[] =>
  [...stack, op].slice(-HISTORY_LIMIT);

const initialState: EditState = {
  edits: {},
  undoStack: [],
  redoStack: [],
  gesture: null,
  dirty: new Set(),
  syncState: 'idle',
  comparing: false,
};

export const useEditStore = create<EditState & EditActions>()((set, get) => {
  /** Live (history-free) change of one image's edit, tracked by the open gesture. */
  const live = (id: ImageId, build: (current: ImageEdit) => ImageEdit): void =>
    set((state) => {
      const current = state.edits[id] ?? DEFAULT_EDIT;
      const next = canonical(build(current));
      if (editsEqual(current, next)) return {};
      return {
        edits: withEdit(state.edits, id, next),
        gesture: state.gesture?.id === id ? state.gesture : { id, before: current },
        dirty: addDirty(state.dirty, [id]),
      };
    });

  /** One undoable operation over many images. Each entry may set a different patch. */
  const batch = (entries: readonly { id: ImageId; patch: EditPatch }[], label: string): void => {
    get().commitGesture('Edit'); // never leave a half-recorded gesture behind
    set((state) => {
      const changes: EditChange[] = [];
      let next = state.edits;
      const seen = new Set<ImageId>();
      for (const { id, patch } of entries) {
        if (seen.has(id)) continue;
        seen.add(id);
        const before = next[id] ?? DEFAULT_EDIT;
        const after = canonical({ ...before, ...patch });
        if (editsEqual(before, after)) continue;
        changes.push({ id, before, after });
        next = withEdit(next, id, after);
      }
      if (changes.length === 0) return {};
      return {
        edits: next,
        undoStack: pushHistory(state.undoStack, { label, changes }),
        redoStack: [],
        dirty: addDirty(
          state.dirty,
          changes.map((change) => change.id),
        ),
      };
    });
  };

  const replay = (op: EditOperation, direction: 'before' | 'after'): void =>
    set((state) => {
      let next = state.edits;
      for (const change of op.changes) next = withEdit(next, change.id, change[direction]);
      return {
        edits: next,
        dirty: addDirty(
          state.dirty,
          op.changes.map((change) => change.id),
        ),
      };
    });

  return {
    ...initialState,

    hydrate: (edits) => set({ ...initialState, edits: { ...edits }, dirty: new Set() }),

    setLive: (id, patch) =>
      live(id, (current) => ({ ...current, adjustments: normalizeAdjustments({ ...current.adjustments, ...patch }) })),
    setCropLive: (id, crop) => live(id, (current) => ({ ...current, crop })),
    setOutputLive: (id, output) => live(id, (current) => ({ ...current, output })),

    commitGesture: (label) => {
      const { gesture, edits } = get();
      if (!gesture) return;
      const after = edits[gesture.id] ?? DEFAULT_EDIT;
      if (editsEqual(gesture.before, after)) {
        set({ gesture: null });
        return;
      }
      set((state) => ({
        gesture: null,
        undoStack: pushHistory(state.undoStack, {
          label,
          changes: [{ id: gesture.id, before: gesture.before, after }],
        }),
        redoStack: [],
      }));
    },

    setCrop: (id, crop, label) => batch([{ id, patch: { crop } }], label),
    setOutput: (id, output, label) => batch([{ id, patch: { output } }], label),

    applyTo: (ids, adjustments, label) => {
      const target = normalizeAdjustments(adjustments);
      batch(
        ids.map((id) => ({ id, patch: { adjustments: target } })),
        label,
      );
    },
    applyCrops: (entries, label) =>
      batch(
        entries.map(({ id, crop }) => ({ id, patch: { crop } })),
        label,
      ),
    applyOutputTo: (ids, output, label) =>
      batch(
        ids.map((id) => ({ id, patch: { output } })),
        label,
      ),

    undo: () => {
      get().commitGesture('Edit');
      const op = get().undoStack[get().undoStack.length - 1];
      if (!op) return;
      replay(op, 'before');
      set((state) => ({ undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, op] }));
    },

    redo: () => {
      const op = get().redoStack[get().redoStack.length - 1];
      if (!op) return;
      replay(op, 'after');
      set((state) => ({ redoStack: state.redoStack.slice(0, -1), undoStack: pushHistory(state.undoStack, op) }));
    },

    pruneImages: (ids) =>
      set((state) => {
        const removed = new Set(ids);
        const edits: Record<ImageId, ImageEdit> = {};
        for (const [id, value] of Object.entries(state.edits) as [ImageId, ImageEdit][]) {
          if (!removed.has(id)) edits[id] = value;
        }
        const dirty = new Set([...state.dirty].filter((id) => !removed.has(id)));
        return { edits, dirty, undoStack: [], redoStack: [], gesture: null };
      }),

    markSaved: (saved) =>
      set((state) => {
        const dirty = new Set(state.dirty);
        for (const [id, sent] of Object.entries(saved) as [ImageId, ImageEdit][]) {
          const now = state.edits[id] ?? DEFAULT_EDIT;
          if (editsEqual(now, sent)) dirty.delete(id); // changed again meanwhile → stays dirty for the next save
        }
        return { dirty };
      }),

    setSyncState: (syncState) => set({ syncState }),
    setComparing: (comparing) => set({ comparing }),
  };
});

/** The image's whole edit, or the shared frozen default. Stable reference when unedited. */
export const selectEdit =
  (id: ImageId | null) =>
  (state: EditState): ImageEdit =>
    (id ? state.edits[id] : undefined) ?? DEFAULT_EDIT;

/** Adjustments for an image, or the shared frozen default. Stable reference when unedited. */
export const selectAdjustments =
  (id: ImageId | null) =>
  (state: EditState): ImageAdjustments =>
    (id ? state.edits[id]?.adjustments : undefined) ?? DEFAULT_ADJUSTMENTS;

export const selectCrop =
  (id: ImageId | null) =>
  (state: EditState): CropRegion | null =>
    (id ? state.edits[id]?.crop : undefined) ?? null;

export const selectOutput =
  (id: ImageId | null) =>
  (state: EditState): OutputSettings | null =>
    (id ? state.edits[id]?.output : undefined) ?? null;

/** Test helper. */
export function resetEditStore(): void {
  useEditStore.setState({ ...initialState, dirty: new Set() });
}
