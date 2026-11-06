import { describe, expect, it } from 'vitest';

import { toDetectedFaces, type RawFace } from '@/lib/face-detection/convert';

const thumb = { width: 384, height: 288 };
const image = { width: 3840, height: 2880 }; // exactly 10× the thumbnail

const raw = (
  x: number,
  y: number,
  w: number,
  h: number,
  score = 0.9,
  keypoints: RawFace['keypoints'] = [],
): RawFace => ({
  box: { x, y, width: w, height: h },
  score,
  keypoints,
});

describe('toDetectedFaces', () => {
  it('maps thumbnail pixels to oriented original pixels, per axis', () => {
    const [face] = toDetectedFaces([raw(100, 50, 60, 70)], thumb, image);
    expect(face?.box).toEqual({ x: 1000, y: 500, width: 600, height: 700 });
  });

  it('handles a non-uniform rounding ratio on each axis independently', () => {
    const [face] = toDetectedFaces([raw(10, 10, 20, 20)], { width: 100, height: 50 }, { width: 1000, height: 600 });
    expect(face?.box).toEqual({ x: 100, y: 120, width: 200, height: 240 });
  });

  it('converts normalized keypoints to image pixels and names them in the documented BlazeFace order', () => {
    const [face] = toDetectedFaces(
      [
        raw(100, 50, 60, 70, 0.9, [
          { x: 0.3, y: 0.2 },
          { x: 0.4, y: 0.2 },
          { x: 0.35, y: 0.3 },
          { x: 0.35, y: 0.4 },
          { x: 0.28, y: 0.25 },
          { x: 0.42, y: 0.25 },
        ]),
      ],
      thumb,
      image,
    );
    expect(face?.keypoints.rightEye).toEqual({ x: 1152, y: 576 });
    expect(face?.keypoints.leftEye).toEqual({ x: 1536, y: 576 });
    expect(face?.keypoints.noseTip).toEqual({ x: 1344, y: 864 });
    expect(Object.keys(face?.keypoints ?? {})).toHaveLength(6);
  });

  it('sorts by confidence and assigns stable ids f0, f1, …', () => {
    const faces = toDetectedFaces(
      [raw(0, 0, 10, 10, 0.6), raw(50, 0, 10, 10, 0.95), raw(100, 0, 10, 10, 0.8)],
      thumb,
      image,
    );
    expect(faces.map((f) => [f.id, f.score])).toEqual([
      ['f0', 0.95],
      ['f1', 0.8],
      ['f2', 0.6],
    ]);
  });

  it('clamps geometry to the image, so a box hanging off the edge cannot leave it', () => {
    const [face] = toDetectedFaces([raw(-20, -10, 500, 400)], thumb, image);
    expect(face?.box.x).toBe(0);
    expect(face?.box.y).toBe(0);
    expect((face?.box.x ?? 0) + (face?.box.width ?? 0)).toBeLessThanOrEqual(image.width);
    expect((face?.box.y ?? 0) + (face?.box.height ?? 0)).toBeLessThanOrEqual(image.height);
  });

  it('drops malformed detections (non-finite or empty boxes) instead of passing them on', () => {
    expect(
      toDetectedFaces(
        [raw(Number.NaN, 0, 10, 10), raw(0, 0, 0, 10), raw(0, 0, 10, -5), raw(0, 0, 10, 10, Number.NaN)],
        thumb,
        image,
      ),
    ).toEqual([]);
  });

  it('ignores keypoints it cannot place, clamps the rest, and limits the number of faces', () => {
    const [face] = toDetectedFaces(
      [
        raw(10, 10, 20, 20, 0.9, [
          { x: Number.NaN, y: 0.1 },
          { x: 5, y: -2 },
        ]),
      ],
      thumb,
      image,
    );
    expect(face?.keypoints.rightEye).toBeUndefined();
    expect(face?.keypoints.leftEye).toEqual({ x: image.width, y: 0 });
    const many = Array.from({ length: 80 }, (_, i) => raw(i, 0, 5, 5, 0.5 + i / 1000));
    expect(toDetectedFaces(many, thumb, image, 64)).toHaveLength(64);
  });

  it('returns an empty list for no detections', () => {
    expect(toDetectedFaces([], thumb, image)).toEqual([]);
  });
});
