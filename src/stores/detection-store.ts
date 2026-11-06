import { create } from 'zustand';

import { FACE_MODEL_ID } from '@/lib/face-detection/constants';
import type { DetectionResult, ImageId } from '@/types/domain';

/**
 * Face-detection results and progress (SKILLS.md §C.7). Results are cached on the server by image and model; this store
 * mirrors them. Transient failures are kept here only (and retried next session), never persisted.
 */

export type DetectorAvailability = 'unknown' | 'ready' | 'unavailable';

type DetectionState = {
  /** Finished results for the CURRENT model. Results from another model are ignored on hydrate. */
  results: Readonly<Record<ImageId, DetectionResult>>;
  /** Images whose detection failed this session (not persisted). */
  failed: ReadonlySet<ImageId>;
  availability: DetectorAvailability;
  /** Counters for the current run (reset when a new run starts after the previous one finished). */
  total: number;
  done: number;
};

type DetectionActions = {
  hydrate: (results: Readonly<Record<ImageId, DetectionResult>>) => void;
  setResult: (id: ImageId, result: DetectionResult) => void;
  markFailed: (id: ImageId) => void;
  setAvailability: (availability: DetectorAvailability) => void;
  addToRun: (count: number) => void;
  advance: (count?: number) => void;
  endRun: () => void;
  forget: (ids: readonly ImageId[]) => void;
};

const initialState: DetectionState = {
  results: {},
  failed: new Set(),
  availability: 'unknown',
  total: 0,
  done: 0,
};

export const useDetectionStore = create<DetectionState & DetectionActions>()((set) => ({
  ...initialState,

  hydrate: (results) => {
    const current: Record<ImageId, DetectionResult> = {};
    for (const [id, result] of Object.entries(results) as [ImageId, DetectionResult][]) {
      if (result.modelId === FACE_MODEL_ID) current[id] = result; // a different model's results are stale
    }
    set({ results: current });
  },

  setResult: (id, result) => set((state) => ({ results: { ...state.results, [id]: result } })),
  markFailed: (id) => set((state) => ({ failed: new Set(state.failed).add(id) })),
  setAvailability: (availability) => set({ availability }),
  addToRun: (count) => set((state) => ({ total: state.total + count })),
  advance: (count = 1) => set((state) => ({ done: Math.min(state.total, state.done + count) })),
  endRun: () => set({ total: 0, done: 0 }),

  forget: (ids) =>
    set((state) => {
      const gone = new Set(ids);
      const results: Record<ImageId, DetectionResult> = {};
      for (const [id, result] of Object.entries(state.results) as [ImageId, DetectionResult][]) {
        if (!gone.has(id)) results[id] = result;
      }
      return { results, failed: new Set([...state.failed].filter((id) => !gone.has(id))) };
    }),
}));

export const isDetecting = (state: Pick<DetectionState, 'total' | 'done'>): boolean =>
  state.total > 0 && state.done < state.total;

/** Test helper. */
export function resetDetectionStore(): void {
  useDetectionStore.setState({ ...initialState, failed: new Set() });
}
