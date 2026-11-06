import { create } from 'zustand';

/** Upload progress and failures (SKILLS.md §C.5). Transient UI state: never persisted. */

export type UploadFailure = { id: string; name: string; message: string };

/** Failures kept for display. Counters stay exact beyond this cap, so a 3,000-file failure cannot bloat memory. */
export const MAX_DISPLAYED_FAILURES = 200;

type UploadState = {
  /** Counters for the current run; they reset when a new run starts after the previous one finished. */
  total: number;
  done: number;
  failed: number;
  cancelled: number;
  /** Files ignored because they are not supported image types (for example `.DS_Store` in a folder). */
  skipped: number;
  failures: readonly UploadFailure[];
};

type UploadActions = {
  dismissFailures: () => void;
  dismissFailure: (id: string) => void;
  /** Clear the finished run's summary. Does nothing while uploads are active. */
  dismissSummary: () => void;
};

const initialState: UploadState = { total: 0, done: 0, failed: 0, cancelled: 0, skipped: 0, failures: [] };

export const useUploadStore = create<UploadState & UploadActions>()((set) => ({
  ...initialState,
  dismissFailures: () => set({ failures: [] }),
  dismissFailure: (id) => set((state) => ({ failures: state.failures.filter((failure) => failure.id !== id) })),
  dismissSummary: () =>
    set((state) => (isUploading(state) ? {} : { total: 0, done: 0, failed: 0, cancelled: 0, skipped: 0 })),
}));

export function isUploading(state: Pick<UploadState, 'total' | 'done' | 'failed' | 'cancelled'>): boolean {
  return state.done + state.failed + state.cancelled < state.total;
}

/** Test helper: restore the initial state. */
export function resetUploadStore(): void {
  useUploadStore.setState({ ...initialState });
}
