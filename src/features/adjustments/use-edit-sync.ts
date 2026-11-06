'use client';

import { useEffect } from 'react';

import { patchEdits } from '@/lib/api/edits-api';
import { DEFAULT_EDIT, useEditStore } from '@/stores/edit-store';
import type { ImageEdit, ImageId } from '@/types/domain';

const DEBOUNCE_MS = 600;
const MAX_BACKOFF_MS = 30_000;

/**
 * Persist edits to the server (SKILLS.md §C.5): debounced and batched, with exponential backoff on failure.
 * Anything changed while a save is in flight stays dirty and goes out in the next batch. Saves immediately when the
 * tab is hidden, so closing the tab right after an edit does not lose it.
 */
export function useEditSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let failures = 0;
    let disposed = false;

    const store = () => useEditStore.getState();
    const schedule = (ms: number) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void flush(), ms);
    };

    async function flush(): Promise<void> {
      if (running || disposed) return;
      const { dirty, edits } = store();
      if (dirty.size === 0) {
        if (store().syncState !== 'idle') store().setSyncState('idle');
        return;
      }
      running = true;
      store().setSyncState('saving');

      const items = Array.from(dirty, (id) => {
        const edit = edits[id] ?? DEFAULT_EDIT;
        return { id, adjustments: edit.adjustments, crop: edit.crop, output: edit.output };
      });
      const result = await patchEdits(items);
      running = false;
      if (disposed) return;

      if (result.ok) {
        failures = 0;
        const sent: Record<ImageId, ImageEdit> = {};
        for (const item of items)
          sent[item.id] = { adjustments: item.adjustments, crop: item.crop, output: item.output };
        store().markSaved(sent);
        if (store().dirty.size > 0) schedule(0);
        else store().setSyncState('idle');
      } else {
        failures += 1;
        store().setSyncState('error');
        schedule(Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures));
      }
    }

    const unsubscribe = useEditStore.subscribe((state, previous) => {
      if (state.dirty !== previous.dirty && state.dirty.size > 0 && !running) schedule(DEBOUNCE_MS);
    });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
