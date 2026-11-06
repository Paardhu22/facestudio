// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDetectionManager } from '@/features/face-detection/detection-manager';
import { DetectionUnavailableError } from '@/features/face-detection/detection-client';
import { DEFAULT_LIMITS } from '@/lib/config/limits';
import { FACE_MODEL_ID } from '@/lib/face-detection/constants';
import type { RawFace } from '@/lib/face-detection/convert';
import { resetDetectionStore, useDetectionStore } from '@/stores/detection-store';
import { useLibraryStore } from '@/stores/library-store';
import type { DetectionResult, ImageId } from '@/types/domain';

import { imageId, makeSourceImage } from '../../fixtures/source-image';

const detections = () => useDetectionStore.getState();
const faceAt = (x: number): RawFace => ({ box: { x, y: 10, width: 40, height: 50 }, score: 0.9, keypoints: [] });
const ids = (n: number) => Array.from({ length: n }, (_, i) => imageId(i + 1));

function setup(
  options: { faces?: (id: ImageId) => RawFace[]; fail?: (id: ImageId) => Error | null; flushBatchSize?: number } = {},
) {
  const calls: ImageId[] = [];
  const saved: { id: ImageId; result: DetectionResult }[][] = [];
  const persist = vi.fn(async (items: { id: ImageId; result: DetectionResult }[]) => {
    saved.push(items);
    return true;
  });
  const manager = createDetectionManager({
    detect: async (id) => {
      calls.push(id);
      const error = options.fail?.(id);
      if (error) throw error;
      return { width: 384, height: 288, faces: options.faces?.(id) ?? [faceAt(10)] };
    },
    persist,
    flushIntervalMs: 5,
    flushBatchSize: options.flushBatchSize ?? 25,
  });
  return { manager, calls, saved, persist };
}

beforeEach(() => {
  resetDetectionStore();
  useLibraryStore.getState().beginLoad();
  useLibraryStore.getState().finishLoad([], { ...DEFAULT_LIMITS });
  useLibraryStore.getState().addImages(ids(5).map((_, i) => makeSourceImage(i + 1, { width: 3840, height: 2880 })));
});

describe('detection manager', () => {
  it('detects every queued image, one at a time, and stores converted results', async () => {
    const { manager, calls } = setup();
    manager.enqueue(ids(3));
    await manager.idle();
    expect(calls).toEqual(ids(3));
    const result = detections().results[imageId(1)];
    expect(result?.status).toBe('complete');
    expect(result?.modelId).toBe(FACE_MODEL_ID);
    expect(result?.faces[0]?.box).toEqual({ x: 100, y: 100, width: 400, height: 500 }); // thumbnail → ×10 original pixels
  });

  it('records "no face" when the detector finds nothing', async () => {
    const { manager } = setup({ faces: () => [] });
    manager.enqueue([imageId(1)]);
    await manager.idle();
    expect(detections().results[imageId(1)]).toEqual({ modelId: FACE_MODEL_ID, status: 'no_face', faces: [] });
  });

  it('skips images that already have a cached result, unknown images, and duplicates in the queue', async () => {
    detections().setResult(imageId(1), { modelId: FACE_MODEL_ID, status: 'no_face', faces: [] });
    const { manager, calls } = setup();
    manager.enqueue([imageId(1), imageId(2), imageId(2), imageId(99)]);
    manager.enqueue([imageId(2)]);
    await manager.idle();
    expect(calls).toEqual([imageId(2)]);
  });

  it('the open image jumps the queue', async () => {
    const { manager, calls } = setup();
    manager.enqueue(ids(4)); // image 1 starts immediately; 2–4 wait
    manager.enqueue([imageId(4)], { prioritize: true });
    await manager.idle();
    expect(calls).toEqual([imageId(1), imageId(4), imageId(2), imageId(3)]);
  });

  it('reports progress, and resets it when the run is over', async () => {
    const { manager } = setup();
    manager.enqueue(ids(3));
    expect(detections().total).toBe(3);
    await manager.idle();
    expect(detections().total).toBe(0);
    expect(detections().done).toBe(0);
  });

  it('a failure on one image does not stop the others, and the failed image is not retried this session', async () => {
    const { manager, calls } = setup({ fail: (id) => (id === imageId(2) ? new Error('bad thumbnail') : null) });
    manager.enqueue(ids(3));
    await manager.idle();
    expect(detections().failed.has(imageId(2))).toBe(true);
    expect(detections().results[imageId(3)]?.status).toBe('complete');
    manager.enqueue(ids(3));
    await manager.idle();
    expect(calls.filter((id) => id === imageId(2))).toHaveLength(1);
  });

  it('when the detector cannot run at all, it is marked unavailable, the queue is dropped, and nothing more is attempted', async () => {
    const { manager, calls } = setup({ fail: () => new DetectionUnavailableError('model file missing') });
    manager.enqueue(ids(5));
    await manager.idle();
    expect(detections().availability).toBe('unavailable');
    expect(calls).toHaveLength(1); // only the first image was tried
    expect(detections().total).toBe(0);
    manager.enqueue(ids(5));
    await manager.idle();
    expect(calls).toHaveLength(1);
  });

  it('marks the detector ready after the first success', async () => {
    const { manager } = setup();
    expect(detections().availability).toBe('unknown');
    manager.enqueue([imageId(1)]);
    await manager.idle();
    expect(detections().availability).toBe('ready');
  });

  it('saves results in batches and flushes the remainder when the queue empties', async () => {
    const { manager, saved } = setup({ flushBatchSize: 2 });
    manager.enqueue(ids(5));
    await manager.idle();
    const flat = saved.flat();
    expect(flat.map((item) => item.id).sort()).toEqual(ids(5).sort());
    expect(saved.length).toBeGreaterThanOrEqual(2); // not one request per image, and not all at the very end only
  });

  it('keeps results that failed to save and sends them with the next batch instead of recomputing them', async () => {
    let attempts = 0;
    const calls: ImageId[] = [];
    const persisted: ImageId[] = [];
    const manager = createDetectionManager({
      detect: async (id) => {
        calls.push(id);
        return { width: 384, height: 288, faces: [faceAt(10)] };
      },
      persist: async (items) => {
        attempts += 1;
        if (attempts === 1) return false;
        persisted.push(...items.map((item) => item.id));
        return true;
      },
      flushIntervalMs: 1,
      flushBatchSize: 1,
    });
    manager.enqueue(ids(3));
    await manager.idle();
    expect(calls).toEqual(ids(3)); // each image detected exactly once
    expect(new Set(persisted)).toEqual(new Set(ids(3))); // and every result eventually saved
  });

  it('skips an image that was removed while it waited', async () => {
    const { manager, calls } = setup();
    manager.enqueue(ids(3));
    useLibraryStore.getState().removeImages([imageId(2)]);
    await manager.idle();
    expect(calls).not.toContain(imageId(2));
  });

  it('clear() drops what is waiting', async () => {
    const { manager, calls } = setup();
    manager.enqueue(ids(5));
    manager.clear();
    await manager.idle();
    expect(calls.length).toBeLessThan(5);
  });

  it('ignores results cached by a different model when hydrating', () => {
    detections().hydrate({
      [imageId(1)]: { modelId: FACE_MODEL_ID, status: 'no_face', faces: [] },
      [imageId(2)]: { modelId: 'older-model', status: 'no_face', faces: [] },
    });
    expect(Object.keys(detections().results)).toEqual([imageId(1)]);
  });
});
