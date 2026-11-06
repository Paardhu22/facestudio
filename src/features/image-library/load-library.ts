import { fetchDetections, fetchEdits } from '@/lib/api/edits-api';
import { fetchImagePage } from '@/lib/api/images-api';
import type { ListResponse } from '@/lib/api/schemas';
import { useDetectionStore } from '@/stores/detection-store';
import { useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { SourceImage } from '@/types/domain';

/**
 * Load the session's existing images from the server so the library survives page refreshes
 * (SKILLS.md §E-4). Pages are fetched until the cursor runs out, then applied in one update.
 * Returns early (leaving the store in `loading`) when aborted.
 */
export async function loadLibrary(signal?: AbortSignal): Promise<void> {
  const store = useLibraryStore.getState();
  store.beginLoad();

  const images: SourceImage[] = [];
  let limits: ListResponse['limits'] | null = null;
  let cursor: string | null = null;

  do {
    const result = await fetchImagePage(cursor, signal);
    if (signal?.aborted) return;
    if (!result.ok) {
      useLibraryStore.getState().failLoad(result.error.message);
      return;
    }
    images.push(...result.value.images);
    limits = result.value.limits;
    cursor = result.value.nextCursor;
  } while (cursor !== null);

  // Saved edits are non-critical for browsing: if they fail to load the library still opens, unedited.
  const edits = await fetchEdits(signal);
  if (signal?.aborted) return;
  if (edits.ok) useEditStore.getState().hydrate(edits.value);
  const detections = await fetchDetections(signal);
  if (signal?.aborted) return;
  if (detections.ok) useDetectionStore.getState().hydrate(detections.value);

  if (limits) useLibraryStore.getState().finishLoad(images, limits);
}
