import { putDetections } from '@/lib/api/edits-api';
import { thumbUrl } from '@/lib/api/images-api';
import { FACE_MODEL_ID } from '@/lib/face-detection/constants';
import { toDetectedFaces, type RawFace } from '@/lib/face-detection/convert';
import { useDetectionStore } from '@/stores/detection-store';
import { useLibraryStore } from '@/stores/library-store';
import type { DetectionResult, ImageId, SourceImage } from '@/types/domain';

import { DetectionUnavailableError, FaceDetectionClient } from './detection-client';

/**
 * Background face detection (SKILLS.md §C.7, ADR-002, ADR-009). Images are processed ONE AT A TIME (the detector is CPU
 * bound), on their thumbnails, with the open image jumped to the front. Finished results are cached on the server in batches,
 * so each image is detected once ever. If the detector cannot run at all, the manager marks it unavailable and stops, instead
 * of failing every image.
 */

export type DetectionDeps = {
  /** Run the detector on an image's thumbnail. Rejects with `DetectionUnavailableError` when it cannot run at all. */
  detect: (id: ImageId) => Promise<{ width: number; height: number; faces: RawFace[] }>;
  persist: (items: { id: ImageId; result: DetectionResult }[]) => Promise<boolean>;
  flushIntervalMs?: number;
  flushBatchSize?: number;
};

export function createDetectionManager(deps: DetectionDeps) {
  const flushIntervalMs = deps.flushIntervalMs ?? 1000;
  const flushBatchSize = deps.flushBatchSize ?? 25;

  const queue: ImageId[] = [];
  const queued = new Set<ImageId>();
  /** The image being detected right now: it is no longer queued but must not be queued again. */
  let inFlight: ImageId | null = null;
  let running = false;
  let pending: { id: ImageId; result: DetectionResult }[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> = Promise.resolve();

  const detections = () => useDetectionStore.getState();
  const library = () => useLibraryStore.getState();

  function flushNow(): Promise<void> {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const batch = pending;
    pending = [];
    if (batch.length === 0) return flushing;
    flushing = flushing.then(async () => {
      const ok = await deps.persist(batch);
      // Results are already usable locally. If saving failed, keep them for the next batch instead of recomputing.
      if (!ok) pending = [...batch, ...pending];
    });
    return flushing;
  }

  function scheduleFlush(): void {
    if (pending.length >= flushBatchSize) void flushNow();
    else if (flushTimer === null) flushTimer = setTimeout(() => void flushNow(), flushIntervalMs);
  }

  async function detectOne(id: ImageId): Promise<void> {
    const image: SourceImage | undefined = library().images[id];
    if (!image) return; // removed while it was waiting
    try {
      const raw = await deps.detect(id);
      const faces = toDetectedFaces(
        raw.faces,
        { width: raw.width, height: raw.height },
        { width: image.width, height: image.height },
      );
      const result: DetectionResult = {
        modelId: FACE_MODEL_ID,
        status: faces.length > 0 ? 'complete' : 'no_face',
        faces,
      };
      detections().setResult(id, result);
      if (detections().availability !== 'ready') detections().setAvailability('ready');
      pending.push({ id, result });
      scheduleFlush();
    } catch (error) {
      if (error instanceof DetectionUnavailableError) throw error;
      detections().markFailed(id); // this image only; retried in a later session
    }
  }

  async function loop(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const id = queue.shift() as ImageId;
        queued.delete(id);
        inFlight = id;
        try {
          await detectOne(id);
        } catch {
          // The detector itself cannot run: drop the rest of the queue and say so once.
          detections().setAvailability('unavailable');
          detections().advance(queue.length + 1);
          queue.length = 0;
          queued.clear();
          break;
        }
        detections().advance();
      }
    } finally {
      inFlight = null;
      running = false;
      await flushNow();
      if (queue.length === 0) detections().endRun();
    }
  }

  return {
    /**
     * Queue images that have no cached result yet. `prioritize` puts them at the front (used for the open image).
     * Images that are already detected, failed this session, unknown, or already queued are skipped.
     */
    enqueue(ids: readonly ImageId[], options: { prioritize?: boolean } = {}): void {
      if (detections().availability === 'unavailable') return;
      const state = detections();
      const fresh = [...new Set(ids)].filter(
        (id) =>
          library().images[id] && !state.results[id] && !state.failed.has(id) && !queued.has(id) && id !== inFlight,
      );
      if (fresh.length === 0) {
        // Re-prioritize an image that is already waiting.
        if (options.prioritize) {
          for (const id of ids) {
            const at = queue.indexOf(id);
            if (at > 0) {
              queue.splice(at, 1);
              queue.unshift(id);
            }
          }
        }
        return;
      }
      if (options.prioritize) queue.unshift(...fresh);
      else queue.push(...fresh);
      for (const id of fresh) queued.add(id);
      detections().addToRun(fresh.length);
      void loop();
    },
    /** Resolves when the queue is empty and every result has been saved. */
    async idle(): Promise<void> {
      while (running || queue.length > 0) await new Promise((resolve) => setTimeout(resolve, 5));
      await flushNow();
      await flushing;
    },
    /** Drop everything that is queued (used when the library is reloaded). */
    clear(): void {
      queue.length = 0;
      queued.clear();
    },
    get queueLength(): number {
      return queue.length;
    },
  };
}

// ── Browser wiring ─────────────────────────────────────────────────────────────
let sharedClient: FaceDetectionClient | null = null;

async function browserDetect(id: ImageId): Promise<{ width: number; height: number; faces: RawFace[] }> {
  const response = await fetch(thumbUrl(id));
  if (!response.ok) throw new Error(`thumbnail request failed (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  sharedClient ??= new FaceDetectionClient();
  return sharedClient.detect(bitmap);
}

async function browserPersist(items: { id: ImageId; result: DetectionResult }[]): Promise<boolean> {
  return (await putDetections(items)).ok;
}

export const detectionManager = createDetectionManager({ detect: browserDetect, persist: browserPersist });
