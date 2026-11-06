import { describe, expect, it } from 'vitest';

import { isInside } from '@/lib/coordinates/rect';
import { makeAspect, resolveAspect } from '@/lib/cropping/aspect';
import {
  buildCrop,
  changeAspect,
  effectiveAspect,
  recropForImage,
  refitToAspect,
  withRect,
  type BuildInput,
} from '@/lib/cropping/build';
import { DEFAULT_FRAMING } from '@/lib/cropping/framing';
import type { CropRegion, DetectedFace } from '@/types/domain';

const image = { width: 3000, height: 4000 };
const face = (x: number, y: number, w: number, h: number, id: DetectedFace['id'] = 'f0'): DetectedFace => ({
  id,
  box: { x, y, width: w, height: h },
  score: 0.9,
  keypoints: {},
});
const faces = [face(1200, 1000, 500, 600)];

const input = (patch: Partial<BuildInput> = {}): BuildInput => ({
  image,
  mode: 'portrait',
  aspect: makeAspect('4:5'),
  framing: DEFAULT_FRAMING,
  faces,
  faceId: null,
  previous: null,
  ...patch,
});
const ok = (r: ReturnType<typeof buildCrop>): CropRegion => {
  if (!r.ok) throw new Error(`expected a crop, got ${r.reason}`);
  return r.crop;
};

describe('buildCrop', () => {
  it('portrait: frames the detected face at the aspect ratio, inside the image', () => {
    const crop = ok(buildCrop(input()));
    expect(crop.mode).toBe('portrait');
    expect(crop.faceId).toBe('f0');
    expect(crop.manual).toBe(false);
    expect(isInside(crop.rect, image)).toBe(true);
    expect(Math.abs(crop.rect.width / crop.rect.height - 0.8)).toBeLessThan(0.002);
    expect(crop.id).toMatch(/^crp_/);
  });

  it('face-only: grows the face box by the padding', () => {
    const crop = ok(
      buildCrop(input({ mode: 'face', aspect: makeAspect('free'), framing: { ...DEFAULT_FRAMING, padding: 0.5 } })),
    );
    expect(crop.rect).toEqual({ x: 1200 - 250, y: 1000 - 300, width: 1000, height: 1200 });
  });

  it('portrait does not use "free": it falls back to 4:5 and says so in the stored aspect', () => {
    expect(effectiveAspect('portrait', makeAspect('free')).preset).toBe('4:5');
    expect(effectiveAspect('face', makeAspect('free')).preset).toBe('free');
    expect(ok(buildCrop(input({ aspect: makeAspect('free') }))).aspect.preset).toBe('4:5');
  });

  it('face modes report why they cannot build: not detected yet, or no face found', () => {
    expect(buildCrop(input({ faces: null }))).toEqual({ ok: false, reason: 'not_detected' });
    expect(buildCrop(input({ faces: [] }))).toEqual({ ok: false, reason: 'no_face' });
    expect(buildCrop(input({ mode: 'face', faces: [] }))).toEqual({ ok: false, reason: 'no_face' });
  });

  it('custom needs no face: a centered box, or the previous box reshaped to the new ratio', () => {
    const fresh = ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('free'), faces: null })));
    expect(fresh.rect).toEqual({ x: 300, y: 400, width: 2400, height: 3200 });
    expect(fresh.manual).toBe(true);

    const square = ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('1:1'), faces: null, previous: fresh })));
    expect(square.rect.width).toBe(square.rect.height);
    expect(square.id).toBe(fresh.id); // the same crop, reshaped
    expect(square.rect.x + square.rect.width / 2).toBeCloseTo(1500, 0);
    expect(square.rect.width).toBeLessThanOrEqual(fresh.rect.width); // stays inside the previous box, never grows
  });

  it('picks the requested face among several, else the largest', () => {
    const two = [face(100, 100, 200, 240, 'f0'), face(2000, 1500, 600, 700, 'f1')];
    expect(ok(buildCrop(input({ faces: two }))).faceId).toBe('f1');
    expect(ok(buildCrop(input({ faces: two, faceId: 'f0' }))).faceId).toBe('f0');
  });

  it('keeps the previous crop id when it is rebuilt', () => {
    const first = ok(buildCrop(input()));
    expect(ok(buildCrop(input({ previous: first, mode: 'face' }))).id).toBe(first.id);
  });
});

describe('changeAspect', () => {
  it('re-frames an automatic face crop from the face (the rectangle is derived)', () => {
    const portrait = ok(buildCrop(input()));
    const square = changeAspect(portrait, makeAspect('1:1'), image, faces);
    expect(Math.abs(square.rect.width - square.rect.height)).toBeLessThanOrEqual(1);
    expect(square.faceId).toBe('f0');
    expect(square.manual).toBe(false);
  });

  it('a hand-adjusted face crop keeps its box and only reshapes within it', () => {
    const manual: CropRegion = {
      ...ok(buildCrop(input())),
      manual: true,
      rect: { x: 800, y: 900, width: 1200, height: 1500 },
    };
    const wide = changeAspect(manual, makeAspect('16:9'), image, faces);
    expect(wide.rect.x).toBeGreaterThanOrEqual(manual.rect.x - 1);
    expect(wide.rect.width).toBeLessThanOrEqual(manual.rect.width);
    expect(Math.abs(wide.rect.width / wide.rect.height - 16 / 9)).toBeLessThan(0.02);
  });

  it('free keeps a custom box exactly, and original follows the image ratio', () => {
    const custom = ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('1:1'), faces: null })));
    expect(changeAspect(custom, makeAspect('free'), image, null).rect).toEqual(custom.rect);
    const original = changeAspect(custom, makeAspect('original'), image, null);
    expect(Math.abs(original.rect.width / original.rect.height - 0.75)).toBeLessThan(0.01);
  });

  it('refitToAspect with no ratio only clamps', () => {
    expect(refitToAspect({ x: -10, y: 0, width: 500, height: 500 }, null, image).x).toBe(0);
  });
});

describe('withRect (typed X / Y / W / H)', () => {
  const free: CropRegion = ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('free'), faces: null })));
  const locked: CropRegion = ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('4:5'), faces: null })));

  it('X and Y move the box and are clamped inside the image', () => {
    expect(withRect(free, { x: 100, y: 50 }, image).rect).toMatchObject({
      x: 100,
      y: 50,
      width: free.rect.width,
      height: free.rect.height,
    });
    const far = withRect(free, { x: 99999, y: -5 }, image).rect;
    expect(far.x + far.width).toBeLessThanOrEqual(image.width);
    expect(far.y).toBe(0);
  });

  it('width and height are independent when free, never below the minimum or past the image', () => {
    expect(withRect(free, { width: 1000 }, image).rect).toMatchObject({ width: 1000, height: free.rect.height });
    expect(withRect(free, { width: 1 }, image).rect.width).toBe(16);
    expect(withRect(free, { width: 99999 }, image).rect.width).toBe(image.width);
  });

  it('with a fixed ratio, typing a width sets the height and typing a height sets the width', () => {
    const w = withRect(locked, { width: 1200 }, image).rect;
    expect(w.width).toBe(1200);
    expect(w.height).toBe(1500);
    const h = withRect(locked, { height: 2000 }, image).rect;
    expect(h.height).toBe(2000);
    expect(h.width).toBe(1600);
  });

  it('a fixed-ratio box that would not fit shrinks (keeping the ratio) instead of leaving the image', () => {
    const r = withRect(locked, { width: 99999 }, image).rect;
    expect(isInside(r, image)).toBe(true);
    expect(Math.abs(r.width / r.height - 0.8)).toBeLessThan(0.002);
  });

  it('ignores non-finite input and marks the crop as manual', () => {
    const r = withRect(free, { x: Number.NaN, width: Number.POSITIVE_INFINITY }, image);
    expect(r.rect).toEqual(free.rect);
    expect(r.manual).toBe(true);
  });

  it('every result is an integer rectangle inside the image', () => {
    for (let i = 0; i < 300; i++) {
      const base = i % 2 ? locked : free;
      const r = withRect(
        base,
        { x: ((i * 211) % 4000) - 400, y: ((i * 97) % 5000) - 300, width: (i * 53) % 4200, height: (i * 71) % 5200 },
        image,
      ).rect;
      expect(isInside(r, image)).toBe(true);
      for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('recropForImage (batch apply)', () => {
  const source = ok(buildCrop(input()));
  const other = { width: 2000, height: 3000 };

  it("face modes are RE-FRAMED from the other image's own face, never copied", () => {
    const elsewhere = [face(200, 300, 360, 430)];
    const result = recropForImage(source, image, other, elsewhere);
    const crop = ok(result);
    expect(crop.rect).not.toEqual(source.rect);
    expect(isInside(crop.rect, other)).toBe(true);
    expect(crop.rect.x + crop.rect.width / 2).toBeLessThan(1000); // follows the face on the left, not the source position
    expect(crop.id).not.toBe(source.id);
  });

  it('skips images with no face, and images detection has not reached', () => {
    expect(recropForImage(source, image, other, [])).toEqual({ ok: false, reason: 'no_face' });
    expect(recropForImage(source, image, other, null)).toEqual({ ok: false, reason: 'not_detected' });
  });

  it('custom crops are mapped by normalized position and size, needing no faces', () => {
    const custom: CropRegion = {
      ...ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('free'), faces: null }))),
      rect: { x: 750, y: 1000, width: 1500, height: 2000 },
    };
    const mapped = ok(recropForImage(custom, image, other, null));
    expect(mapped.rect).toEqual({ x: 500, y: 750, width: 1000, height: 1500 });
  });

  it('applying to an image of the same size reproduces the same framing when its face is in the same place', () => {
    const again = ok(recropForImage(source, image, image, faces));
    expect(again.rect).toEqual(source.rect);
  });

  it('uses the target image for "original" aspect', () => {
    const originalAspect = ok(buildCrop(input({ mode: 'custom', aspect: makeAspect('original'), faces: null })));
    const mapped = ok(recropForImage(originalAspect, image, { width: 4000, height: 3000 }, null));
    expect(
      Math.abs(
        mapped.rect.width / mapped.rect.height - resolveAspect(makeAspect('original'), { width: 4000, height: 3000 })!,
      ),
    ).toBeLessThan(0.01);
  });
});
