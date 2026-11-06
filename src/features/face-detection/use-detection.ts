'use client';

import { useEffect } from 'react';

import { useDetectionStore } from '@/stores/detection-store';
import { useLibraryStore } from '@/stores/library-store';

import { detectionManager } from './detection-manager';

/**
 * Keep detection running in the background: once the library is loaded, and whenever images are added, queue every image that
 * has no cached result, with the open image first. Does nothing when the detector is unavailable.
 */
export function useBackgroundDetection(): void {
  useEffect(() => {
    const queueMissing = () => {
      const { loadState, order, activeId } = useLibraryStore.getState();
      if (loadState !== 'ready') return;
      if (activeId) detectionManager.enqueue([activeId], { prioritize: true });
      detectionManager.enqueue(order);
    };

    queueMissing();
    return useLibraryStore.subscribe((state, previous) => {
      if (state.loadState === 'loading' && previous.loadState !== 'loading') detectionManager.clear();
      if (
        state.loadState !== previous.loadState ||
        state.order !== previous.order ||
        state.activeId !== previous.activeId
      ) {
        queueMissing();
      }
    });
  }, []);
}

/** Face-detection state for one image, for the crop panel. */
export function useFaceDetection(id: string | null) {
  const result = useDetectionStore((s) => (id ? s.results[id as `img_${string}`] : undefined));
  const availability = useDetectionStore((s) => s.availability);
  const failed = useDetectionStore((s) => (id ? s.failed.has(id as `img_${string}`) : false));
  return { result, availability, failed };
}
