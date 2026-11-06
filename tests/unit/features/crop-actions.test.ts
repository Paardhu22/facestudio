// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyCropTo,
  chooseAspect,
  chooseShape,
  chooseFace,
  chooseMode,
  centerCrop,
  removeCrop,
  setFramingLive,
  typeRect,
} from '@/features/cropping/crop-actions';
import { DEFAULT_CONFIG_FOR_TEST } from '../../fixtures/limits';
import { makeAspect } from '@/lib/cropping/aspect';
import { isInside } from '@/lib/coordinates/rect';
import { FACE_MODEL_ID } from '@/lib/face-detection/constants';
import { resetDetectionStore, useDetectionStore } from '@/stores/detection-store';
import { resetEditStore, selectCrop, useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { DetectedFace, ImageId } from '@/types/domain';

import { imageId, makeSourceImage } from '../../fixtures/source-image';

const edit = () => useEditStore.getState();
const cropOf = (id: ImageId) => selectCrop(id)(edit());
const [a, b, c, d] = [imageId(1), imageId(2), imageId(3), imageId(4)] as const;

const face = (x: number, y: number, w: number, h: number, id: DetectedFace['id'] = 'f0'): DetectedFace => ({
  id,
  box: { x, y, width: w, height: h },
  score: 0.9,
  keypoints: {},
});
const detected = (id: ImageId, ...faces: DetectedFace[]) =>
  useDetectionStore
    .getState()
    .setResult(id, { modelId: FACE_MODEL_ID, status: faces.length ? 'complete' : 'no_face', faces });

beforeEach(() => {
  resetEditStore();
  resetDetectionStore();
  useLibraryStore.getState().beginLoad();
  useLibraryStore.getState().finishLoad([], DEFAULT_CONFIG_FOR_TEST);
  useLibraryStore
    .getState()
    .addImages([
      makeSourceImage(1, { width: 3000, height: 4000 }),
      makeSourceImage(2, { width: 3000, height: 4000 }),
      makeSourceImage(3, { width: 2000, height: 3000 }),
      makeSourceImage(4, { width: 3000, height: 4000 }),
    ]);
});

describe('chooseMode', () => {
  it('centers a moved crop as one step, preserving dimensions and restoring it on undo', () => {
    chooseMode(a, 'custom');
    typeRect(a, { x: 100, y: 200 });
    const before = cropOf(a)!;
    const count = edit().undoStack.length;
    centerCrop(a);
    expect(cropOf(a)!.rect).toEqual({ ...before.rect, x: 300, y: 400 });
    expect(edit().undoStack).toHaveLength(count + 1);
    expect(edit().undoStack.at(-1)?.label).toBe('Center crop');
    edit().undo();
    expect(cropOf(a)).toEqual(before);
  });
  it('custom needs no detection and makes a centered box', () => {
    expect(chooseMode(a, 'custom')).toEqual({ ok: true });
    expect(cropOf(a)?.mode).toBe('custom');
    expect(cropOf(a)?.rect).toEqual({ x: 300, y: 400, width: 2400, height: 3200 });
    expect(edit().undoStack.at(-1)?.label).toBe('Custom crop');
  });

  it('portrait and face-only frame the detected face', () => {
    detected(a, face(1200, 1000, 500, 600));
    expect(chooseMode(a, 'portrait')).toEqual({ ok: true });
    expect(cropOf(a)?.mode).toBe('portrait');
    expect(cropOf(a)?.faceId).toBe('f0');
    expect(chooseMode(a, 'face')).toEqual({ ok: true });
    expect(cropOf(a)?.mode).toBe('face');
    expect(isInside(cropOf(a)!.rect, { width: 3000, height: 4000 })).toBe(true);
  });

  it('never forces a face crop: with no face or no detection it reports why and changes nothing', () => {
    expect(chooseMode(a, 'portrait')).toEqual({ ok: false, reason: 'not_detected' });
    detected(b);
    expect(chooseMode(b, 'portrait')).toEqual({ ok: false, reason: 'no_face' });
    expect(cropOf(a)).toBeNull();
    expect(cropOf(b)).toBeNull();
    expect(edit().undoStack).toHaveLength(0);
  });

  it('switching from custom to a face mode re-frames; back to custom keeps the box', () => {
    detected(a, face(1200, 1000, 500, 600));
    chooseMode(a, 'custom');
    chooseMode(a, 'portrait');
    const framed = cropOf(a)!.rect;
    chooseMode(a, 'custom');
    expect(cropOf(a)!.rect).toEqual(framed);
    expect(cropOf(a)!.mode).toBe('custom');
  });

  it('is undoable', () => {
    chooseMode(a, 'custom');
    edit().undo();
    expect(cropOf(a)).toBeNull();
  });
});

describe('chooseAspect', () => {
  it('with no crop it starts a custom box at that ratio', () => {
    chooseAspect(a, makeAspect('1:1'));
    expect(cropOf(a)?.mode).toBe('custom');
    expect(cropOf(a)!.rect.width).toBe(cropOf(a)!.rect.height);
  });

  it('re-frames an automatic face crop, and reshapes a custom one', () => {
    detected(a, face(1200, 1000, 500, 600));
    chooseMode(a, 'portrait');
    chooseAspect(a, makeAspect('1:1'));
    expect(Math.abs(cropOf(a)!.rect.width - cropOf(a)!.rect.height)).toBeLessThanOrEqual(1);
    expect(cropOf(a)?.faceId).toBe('f0');
  });

  it('portrait refuses "free" by falling back to 4:5', () => {
    detected(a, face(1200, 1000, 500, 600));
    chooseMode(a, 'portrait');
    chooseAspect(a, makeAspect('free'));
    expect(cropOf(a)?.aspect.preset).toBe('4:5');
  });
});

describe('chooseFace / setFramingLive', () => {
  it('chooses among several faces', () => {
    detected(a, face(200, 200, 300, 360, 'f0'), face(2000, 2400, 500, 600, 'f1'));
    chooseMode(a, 'portrait'); // the larger face, f1
    expect(cropOf(a)?.faceId).toBe('f1');
    chooseFace(a, 'f0');
    expect(cropOf(a)?.faceId).toBe('f0');
    expect(cropOf(a)!.rect.x).toBeLessThan(1000);
  });

  it('chooseFace does nothing without a face-mode crop', () => {
    detected(a, face(200, 200, 300, 360));
    expect(chooseFace(a, 'f0')).toEqual({ ok: false, reason: 'no_crop' });
    chooseMode(a, 'custom');
    expect(chooseFace(a, 'f0')).toEqual({ ok: false, reason: 'no_crop' });
  });

  it('a framing slider re-derives the box live (and replaces a hand-adjusted one), as one undo step', () => {
    detected(a, face(1200, 1000, 500, 600));
    chooseMode(a, 'face');
    typeRect(a, { x: 10 });
    expect(cropOf(a)?.manual).toBe(true);
    const undoDepth = edit().undoStack.length;

    for (const padding of [0.3, 0.5, 0.7]) setFramingLive(a, { padding });
    expect(cropOf(a)?.framing.padding).toBe(0.7);
    expect(cropOf(a)?.manual).toBe(false);
    expect(edit().undoStack).toHaveLength(undoDepth); // nothing recorded until the slider is released
    edit().commitGesture('Padding');
    expect(edit().undoStack).toHaveLength(undoDepth + 1);
  });
});

describe('typeRect / removeCrop', () => {
  it('typed values are clamped inside the image, and the crop becomes manual', () => {
    chooseMode(a, 'custom');
    typeRect(a, { x: 99999, width: 99999 });
    expect(isInside(cropOf(a)!.rect, { width: 3000, height: 4000 })).toBe(true);
    expect(cropOf(a)?.manual).toBe(true);
  });

  it('does nothing without a crop', () => {
    expect(typeRect(a, { x: 5 })).toEqual({ ok: false, reason: 'no_crop' });
  });

  it('removeCrop is undoable and a no-op when there is no crop', () => {
    removeCrop(a);
    expect(edit().undoStack).toHaveLength(0);
    chooseMode(a, 'custom');
    removeCrop(a);
    expect(cropOf(a)).toBeNull();
    edit().undo();
    expect(cropOf(a)).not.toBeNull();
  });
});

describe('applyCropTo (batch)', () => {
  it("re-frames face modes from EACH image's own face, and skips images it cannot frame", () => {
    detected(a, face(1200, 1000, 500, 600));
    detected(b, face(300, 500, 500, 600)); // a face elsewhere in the frame
    detected(c); // no face
    // d has not been detected yet
    chooseMode(a, 'portrait');

    const result = applyCropTo(a, [a, b, c, d], 'Apply crop to all');
    expect(result).toEqual({ applied: 1, skippedNoFace: 1, skippedNotDetected: 1 });
    expect(cropOf(b)!.rect.x + cropOf(b)!.rect.width / 2).toBeLessThan(1200); // follows b's face, not a's
    expect(cropOf(b)!.rect).not.toEqual(cropOf(a)!.rect);
    expect(cropOf(c)).toBeNull();
    expect(cropOf(d)).toBeNull();
    expect(cropOf(b)!.id).not.toBe(cropOf(a)!.id);
  });

  it('is ONE undoable operation covering all applied images', () => {
    chooseMode(a, 'custom');
    const before = edit().undoStack.length;
    expect(applyCropTo(a, [b, c, d], 'Apply crop to all').applied).toBe(3);
    expect(edit().undoStack).toHaveLength(before + 1);
    edit().undo();
    expect([b, c, d].map((id) => cropOf(id))).toEqual([null, null, null]);
    expect(cropOf(a)).not.toBeNull();
  });

  it("custom crops need no faces and are mapped to each image's own size", () => {
    chooseMode(a, 'custom'); // 3000×4000, 80% centered
    applyCropTo(a, [c], 'Apply crop to selected'); // c is 2000×3000
    expect(cropOf(c)!.rect).toEqual({ x: 200, y: 300, width: 1600, height: 2400 });
  });

  it('does nothing when the source has no crop, and never applies to itself', () => {
    expect(applyCropTo(a, [b], 'x')).toEqual({ applied: 0, skippedNoFace: 0, skippedNotDetected: 0 });
    chooseMode(a, 'custom');
    const before = cropOf(a);
    applyCropTo(a, [a], 'x');
    expect(cropOf(a)).toEqual(before);
  });
});

describe('crop shapes', () => {
  it.each(['circle', 'square'] as const)('keeps %s equal-sided for typed sizes, ratios, and mode switches', (shape) => {
    chooseShape(a, shape);
    typeRect(a, { width: 800 });
    expect(cropOf(a)!.rect.width).toBe(800);
    expect(cropOf(a)!.rect.height).toBe(800);
    chooseAspect(a, makeAspect('16:9'));
    expect(cropOf(a)!.aspect).toEqual(makeAspect('1:1'));
    detected(a, face(1000, 1000, 300, 400));
    chooseMode(a, 'portrait');
    expect(cropOf(a)!.shape).toBe(shape);
    expect(cropOf(a)!.rect.width).toBe(cropOf(a)!.rect.height);
  });
  it('changes a shape as one undoable operation without changing adjustments or output', () => {
    chooseMode(a, 'custom');
    edit().setLive(a, { exposure: 1 });
    edit().commitGesture('Exposure');
    const before = cropOf(a);
    const count = edit().undoStack.length;
    chooseShape(a, 'hexagon');
    expect(cropOf(a)!.shape).toBe('hexagon');
    expect(cropOf(a)!.rect).toEqual(before!.rect);
    expect(edit().undoStack).toHaveLength(count + 1);
    expect(edit().edits[a]!.adjustments.exposure).toBe(1);
    edit().undo();
    expect(cropOf(a)).toEqual(before);
    edit().redo();
    expect(cropOf(a)!.shape).toBe('hexagon');
  });
  it('unlocks rectangle proportions after a circle and preserves shapes across custom batch mapping', () => {
    chooseShape(a, 'circle');
    expect(applyCropTo(a, [b, c], 'Apply shape').applied).toBe(2);
    for (const id of [b, c]) {
      expect(cropOf(id)!.shape).toBe('circle');
      expect(cropOf(id)!.rect.width).toBe(cropOf(id)!.rect.height);
    }
    chooseShape(a, 'rectangle');
    expect(cropOf(a)!.aspect.preset).toBe('free');
    typeRect(a, { width: 700, height: 400 });
    expect(cropOf(a)!.rect).toMatchObject({ width: 700, height: 400 });
  });
  it('can reshape an existing face crop while detection results are still loading', () => {
    detected(a, face(1000, 1000, 300, 400));
    chooseMode(a, 'portrait');
    resetDetectionStore();
    expect(chooseShape(a, 'circle')).toEqual({ ok: true });
    expect(cropOf(a)!.shape).toBe('circle');
    expect(cropOf(a)!.rect.width).toBe(cropOf(a)!.rect.height);
  });
  it('reframes each target face while keeping the shape', () => {
    detected(a, face(1000, 1000, 300, 400));
    detected(c, face(200, 300, 200, 250));
    chooseMode(a, 'portrait');
    chooseShape(a, 'circle');
    expect(applyCropTo(a, [c], 'Apply shape').applied).toBe(1);
    expect(cropOf(c)!.shape).toBe('circle');
    expect(cropOf(c)!.rect.width).toBe(cropOf(c)!.rect.height);
    expect(cropOf(c)!.rect).not.toEqual(cropOf(a)!.rect);
  });
});
