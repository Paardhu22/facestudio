/**
 * Best-effort localStorage access (SKILLS.md §C.9 / §D.7).
 * Storage can be missing (SSR), blocked (privacy mode), or full; every access is guarded and
 * failures degrade to "nothing stored". Use only for per-viewer conveniences, never for edit state.
 */
export const safeLocalStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem(key: string): string | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or storage blocked: ignore (convenience only).
    }
  },
};
