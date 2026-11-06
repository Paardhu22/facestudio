import { describe, expect, it } from 'vitest';

import { isInside } from '@/lib/coordinates/rect';
import { defaultCustomRect, mapCustomCrop } from '@/lib/cropping/custom';
import { DEFAULT_FRAMING, faceAnchorX, faceOnlyCrop, newCropId, pickFace, portraitCrop } from '@/lib/cropping/framing';
import type { DetectedFace } from '@/types/domain';

const face = (
  box: { x: number; y: number; width: number; height: number },
  extra: Partial<DetectedFace> = {},
): DetectedFace => ({
  id: 'f0',
  box,
  score: 0.9,
  keypoints: {},
  ...extra,
});

const image = { width: 2000, height: 3000 };

describe('portraitCrop', () => {
  // Face 400 × 480 at (800, 1000): crop height = 480 / 0.42, width = height × 0.8.
  const f = face({ x: 800, y: 1000, width: 400, height: 480 });

  it('sizes the crop from the face, and places the face box at the configured headroom', () => {
    const { rect, constrained } = portraitCrop(f, image, 4 / 5, DEFAULT_FRAMING);
    expect(constrained).toBe(false);
    expect(rect.height).toBeCloseTo(480 / 0.42, -0.5); // ≈ 1143 (integer rounding)
    expect(Math.abs(rect.width / rect.height - 0.8)).toBeLessThan(0.002);
    // The face top sits headroom × height below the crop top.
    expect((f.box.y - rect.y) / rect.height).toBeCloseTo(0.18, 2);
    // Face box is horizontally centered when there are no eye keypoints.
    expect(rect.x + rect.width / 2).toBeCloseTo(1000, -0.5);
    expect(isInside(rect, image)).toBe(true);
  });

  it('centers on the midpoint of the eyes when they were detected', () => {
    const withEyes = face(f.box, { keypoints: { rightEye: { x: 880, y: 1150 }, leftEye: { x: 1060, y: 1150 } } });
    expect(faceAnchorX(withEyes)).toBe(970);
    const { rect } = portraitCrop(withEyes, image, 4 / 5, DEFAULT_FRAMING);
    expect(rect.x + rect.width / 2).toBeCloseTo(970, -0.5);
  });

  it('follows the requested aspect ratio and the face-fill / headroom settings', () => {
    const square = portraitCrop(f, image, 1, { faceFill: 0.5, headroom: 0.1 }).rect;
    expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(1);
    expect(square.height).toBeCloseTo(960, -0.5);
    expect((f.box.y - square.y) / square.height).toBeCloseTo(0.1, 2);
  });

  it('shifts the crop inside the image when the face is near an edge, and says the framing was compromised', () => {
    const nearTop = face({ x: 800, y: 20, width: 400, height: 480 });
    const { rect, constrained } = portraitCrop(nearTop, image, 4 / 5, DEFAULT_FRAMING);
    expect(rect.y).toBe(0);
    expect(constrained).toBe(true);
    expect(isInside(rect, image)).toBe(true);
  });

  it('shrinks uniformly when the crop cannot fit at all, keeping the ratio', () => {
    const huge = face({ x: 100, y: 100, width: 1800, height: 1900 });
    const { rect, constrained } = portraitCrop(huge, image, 4 / 5, DEFAULT_FRAMING);
    expect(constrained).toBe(true);
    expect(isInside(rect, image)).toBe(true);
    expect(Math.abs(rect.width / rect.height - 0.8)).toBeLessThan(0.002);
  });

  it('always yields an integer rectangle inside the image, for faces anywhere', () => {
    for (let i = 0; i < 400; i++) {
      const w = 60 + ((i * 37) % 900);
      const h = w * 1.15;
      const x = (i * 131) % (image.width - w);
      const y = (i * 197) % (image.height - h);
      const { rect } = portraitCrop(
        face({ x, y, width: w, height: h }),
        image,
        [1, 0.8, 0.75, 9 / 16][i % 4] ?? 1,
        DEFAULT_FRAMING,
      );
      expect(isInside(rect, image)).toBe(true);
      for (const v of Object.values(rect)) expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('faceOnlyCrop', () => {
  const f = face({ x: 900, y: 1200, width: 300, height: 360 });

  it('grows the face box by the padding on every side', () => {
    const { rect, constrained } = faceOnlyCrop(f, image, null, { padding: 0.25 });
    expect(constrained).toBe(false);
    expect(rect).toEqual({ x: 900 - 75, y: 1200 - 90, width: 450, height: 540 });
  });

  it('with zero padding it is exactly the face box', () => {
    expect(faceOnlyCrop(f, image, null, { padding: 0 }).rect).toEqual(f.box);
  });

  it('widens (or heightens) the box to the aspect ratio, around the face center', () => {
    const { rect } = faceOnlyCrop(f, image, 1, { padding: 0.25 });
    expect(Math.abs(rect.width - rect.height)).toBeLessThanOrEqual(1);
    expect(rect.height).toBe(540); // the taller side wins; the width grows to match
    expect(rect.x + rect.width / 2).toBeCloseTo(1050, 0);
    expect(rect.y + rect.height / 2).toBeCloseTo(1380, 0);
  });

  it('stays inside the image and reports when the framing was compromised', () => {
    const corner = face({ x: 0, y: 0, width: 300, height: 300 });
    const { rect, constrained } = faceOnlyCrop(corner, image, 1, { padding: 0.5 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(constrained).toBe(true);
  });
});

describe('pickFace', () => {
  const small = face({ x: 0, y: 0, width: 100, height: 100 }, { id: 'f0' });
  const large = face({ x: 200, y: 0, width: 300, height: 300 }, { id: 'f1' });
  it('prefers the requested face, falling back to the largest', () => {
    expect(pickFace([small, large], 'f0')?.id).toBe('f0');
    expect(pickFace([small, large], null)?.id).toBe('f1');
    expect(pickFace([small, large], 'missing')?.id).toBe('f1');
    expect(pickFace([], null)).toBeNull();
  });
});

describe('newCropId', () => {
  it('has the documented shape and is unique', () => {
    const ids = new Set(Array.from({ length: 500 }, newCropId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^crp_[A-Za-z0-9_-]{22}$/);
  });
});

describe('custom crops', () => {
  const photo = { width: 4000, height: 3000 };

  it('the default box is centered and covers 80% (at the aspect ratio when set)', () => {
    expect(defaultCustomRect(photo, null)).toEqual({ x: 400, y: 300, width: 3200, height: 2400 });
    const square = defaultCustomRect(photo, 1);
    expect(square.width).toBe(square.height);
    expect(square.x + square.width / 2).toBeCloseTo(2000, 0);
    expect(isInside(square, photo)).toBe(true);
  });

  it('mapping keeps the NORMALIZED center and relative size on an image of another size', () => {
    const rect = { x: 1000, y: 750, width: 2000, height: 1500 }; // centered, half of each side of a 4000 × 3000 image
    const mapped = mapCustomCrop(rect, photo, { width: 2000, height: 1000 }, null);
    expect(mapped).toEqual({ x: 500, y: 250, width: 1000, height: 500 });
  });

  it('with an aspect ratio, mapping keeps the ratio in pixels instead of stretching it', () => {
    const rect = { x: 1000, y: 750, width: 2000, height: 2000 }; // 1:1
    const mapped = mapCustomCrop(rect, photo, { width: 1000, height: 3000 }, 1);
    expect(mapped.width).toBe(mapped.height);
    expect(isInside(mapped, { width: 1000, height: 3000 })).toBe(true);
    expect(mapped.x + mapped.width / 2).toBeCloseTo(500, 0); // same normalized center
  });

  it('mapping always lands inside the target image, however different its size', () => {
    for (let i = 0; i < 300; i++) {
      const to = { width: 200 + ((i * 53) % 5000), height: 200 + ((i * 89) % 5000) };
      const aspect = [null, 1, 4 / 5, 16 / 9][i % 4] ?? null;
      const r = mapCustomCrop({ x: 300 + i, y: 200 + i, width: 1500, height: 1200 }, photo, to, aspect);
      expect(isInside(r, to)).toBe(true);
      expect(r.width).toBeGreaterThan(0);
    }
  });

  it('mapping onto an image of the same size is the identity', () => {
    const rect = { x: 123, y: 456, width: 1000, height: 800 };
    expect(mapCustomCrop(rect, photo, photo, null)).toEqual(rect);
  });
});
