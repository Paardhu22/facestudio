import { create } from 'zustand';

import { DEFAULT_LIMITS, type Limits } from '@/lib/config/limits';
import {
  applyImageClick,
  clearSelection,
  pruneSelection,
  selectAll,
  toggleImage,
  type ClickModifiers,
} from '@/lib/library/selection';
import { mergeIntoOrder, sortKeyFor } from '@/lib/library/sort';
import type { ImageId, SourceImage } from '@/types/domain';

/**
 * Library state: the imported images and their selection (SKILLS.md §C.5). Persistent data lives on the
 * server; this store mirrors it. Components subscribe with narrow selectors (`s => s.images[id]`).
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type LibraryState = {
  loadState: LoadState;
  loadError: string | null;
  limits: Limits;

  images: Readonly<Record<ImageId, SourceImage>>;
  /** Ids in display order (natural sort by relative path or file name). */
  order: readonly ImageId[];
  sortKeys: Readonly<Record<ImageId, string>>;

  selection: ReadonlySet<ImageId>;
  anchorId: ImageId | null;
  /** The image open on the canvas. */
  activeId: ImageId | null;

  query: string;
  duplicatesOnly: boolean;
};

type LibraryActions = {
  beginLoad: () => void;
  /** Merge the server's list with anything added while loading, then mark the library ready. */
  finishLoad: (images: readonly SourceImage[], limits: Limits) => void;
  failLoad: (message: string) => void;
  addImages: (images: readonly SourceImage[]) => void;
  removeImages: (ids: readonly ImageId[]) => void;

  clickImage: (id: ImageId, modifiers: ClickModifiers, visibleIds: readonly ImageId[]) => void;
  toggleImage: (id: ImageId) => void;
  selectAll: (visibleIds: readonly ImageId[]) => void;
  clearSelection: () => void;

  setQuery: (query: string) => void;
  setDuplicatesOnly: (value: boolean) => void;
};

const initialState: LibraryState = {
  loadState: 'idle',
  loadError: null,
  limits: { ...DEFAULT_LIMITS },
  images: {},
  order: [],
  sortKeys: {},
  selection: new Set(),
  anchorId: null,
  activeId: null,
  query: '',
  duplicatesOnly: false,
};

function withAdded(state: LibraryState, incoming: readonly SourceImage[]): Partial<LibraryState> {
  const images: Record<ImageId, SourceImage> = { ...state.images };
  const sortKeys: Record<ImageId, string> = { ...state.sortKeys };
  const added: ImageId[] = [];
  for (const image of incoming) {
    if (images[image.id]) continue; // already known (upload flush racing the initial list load)
    images[image.id] = image;
    sortKeys[image.id] = sortKeyFor(image.relativePath ?? image.originalFilename);
    added.push(image.id);
  }
  if (added.length === 0) return {};
  return { images, sortKeys, order: mergeIntoOrder(state.order, added, sortKeys) };
}

export const useLibraryStore = create<LibraryState & LibraryActions>()((set) => ({
  ...initialState,

  beginLoad: () => set({ ...initialState, loadState: 'loading', selection: new Set(), limits: { ...DEFAULT_LIMITS } }),

  finishLoad: (images, limits) =>
    set((state) => ({ ...withAdded(state, images), limits, loadState: 'ready', loadError: null })),

  failLoad: (message) => set({ loadState: 'error', loadError: message }),

  addImages: (images) => set((state) => withAdded(state, images)),

  removeImages: (ids) =>
    set((state) => {
      const removed = new Set(ids.filter((id) => state.images[id]));
      if (removed.size === 0) return {};
      const images: Record<ImageId, SourceImage> = {};
      const sortKeys: Record<ImageId, string> = {};
      for (const id of state.order) {
        if (removed.has(id)) continue;
        const image = state.images[id];
        if (!image) continue;
        // A survivor that was flagged as a duplicate of a removed image is no longer flagged.
        images[id] =
          image.duplicateOfId !== null && removed.has(image.duplicateOfId) ? { ...image, duplicateOfId: null } : image;
        sortKeys[id] = state.sortKeys[id] ?? '';
      }
      return {
        images,
        sortKeys,
        order: state.order.filter((id) => !removed.has(id)),
        ...pruneSelection(state, removed),
      };
    }),

  clickImage: (id, modifiers, visibleIds) => set((state) => applyImageClick(state, id, modifiers, visibleIds)),
  toggleImage: (id) => set((state) => toggleImage(state, id)),
  selectAll: (visibleIds) => set((state) => selectAll(state, visibleIds)),
  clearSelection: () => set((state) => clearSelection(state)),

  setQuery: (query) => set({ query }),
  setDuplicatesOnly: (duplicatesOnly) => set({ duplicatesOnly }),
}));
