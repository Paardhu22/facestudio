import { describe, expect, it } from 'vitest';

import { computeOutputSize, DEFAULT_OUTPUT, isDefaultOutput, normalizeOutput } from '@/lib/cropping/output';
import type { OutputSettings } from '@/types/domain';

const crop = { width: 2000, height: 2500 }; // 4:5
const MAX = 16383;
const out = (resize: OutputSettings['resize'], allowUpscale = false) =>
  computeOutputSize(crop, { resize, allowUpscale }, MAX);

describe('computeOutputSize', () => {
  it('"none" keeps the crop size', () => {
    expect(out({ mode: 'none' })).toMatchObject({
      width: 2000,
      height: 2500,
      scale: 1,
      upscaled: false,
      distorted: false,
    });
  });

  it('long edge, width, and height scale uniformly and never distort', () => {
    expect(out({ mode: 'longEdge', size: 1000 })).toMatchObject({ width: 800, height: 1000 });
    expect(out({ mode: 'width', width: 1000 })).toMatchObject({ width: 1000, height: 1250 });
    expect(out({ mode: 'height', height: 500 })).toMatchObject({ width: 400, height: 500 });
  });

  it('does not enlarge pixels unless upscaling is allowed', () => {
    expect(out({ mode: 'longEdge', size: 8000 })).toMatchObject({ width: 2000, height: 2500, upscaled: false });
    expect(out({ mode: 'longEdge', size: 5000 }, true)).toMatchObject({ width: 4000, height: 5000, upscaled: true });
    expect(out({ mode: 'width', width: 6000 })).toMatchObject({ width: 2000, height: 2500 });
  });

  describe('exact size with a fit strategy', () => {
    const exact = (fit: 'inside' | 'cover' | 'pad' | 'stretch', allowUpscale = false) =>
      out({ mode: 'exact', width: 1080, height: 1080, fit }, allowUpscale);

    it('inside: scales to fit within the box, so the result may be smaller than the box', () => {
      expect(exact('inside')).toMatchObject({ width: 864, height: 1080, distorted: false });
    });

    it('cover: fills the exact box (the overflow is trimmed from the crop), no distortion', () => {
      expect(exact('cover')).toMatchObject({ width: 1080, height: 1080, distorted: false });
    });

    it('pad: the exact canvas, with the whole crop scaled to fit inside it', () => {
      const r = exact('pad');
      expect(r).toMatchObject({ width: 1080, height: 1080, distorted: false });
      expect(r.scale).toBeCloseTo(0.432, 6); // 1080 / 2500
    });

    it('stretch: the exact size, flagged as distorting when the proportions differ', () => {
      expect(exact('stretch')).toMatchObject({ width: 1080, height: 1080, distorted: true });
      expect(out({ mode: 'exact', width: 800, height: 1000, fit: 'stretch' })).toMatchObject({ distorted: false });
    });

    it('without upscaling: cover shrinks its box, pad keeps the canvas but not the enlargement, stretch stays explicit', () => {
      const big = (fit: 'cover' | 'pad' | 'stretch') => out({ mode: 'exact', width: 4000, height: 4000, fit });
      const cover = big('cover');
      expect(cover.width).toBe(cover.height);
      expect(cover.width).toBeLessThanOrEqual(2500); // cannot be larger than the crop's own resolution
      expect(cover.upscaled).toBe(false);
      expect(big('pad')).toMatchObject({ width: 4000, height: 4000, upscaled: false, scale: 1 });
      expect(big('stretch')).toMatchObject({ width: 4000, height: 4000, distorted: true });
    });

    it('with upscaling allowed, exact sizes are honored', () => {
      expect(exact('cover', true)).toMatchObject({ width: 1080, height: 1080 });
      expect(out({ mode: 'exact', width: 4000, height: 4000, fit: 'inside' }, true)).toMatchObject({
        width: 3200,
        height: 4000,
        upscaled: true,
      });
    });
  });

  it('never exceeds the maximum output side, and says so', () => {
    const r = computeOutputSize(
      { width: 6000, height: 4000 },
      { resize: { mode: 'longEdge', size: 40000 }, allowUpscale: true },
      MAX,
    );
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX);
    expect(r.limited).toBe(true);
    expect(r.width / r.height).toBeCloseTo(1.5, 2);
  });

  it('never returns a side below one pixel', () => {
    const r = computeOutputSize(
      { width: 3000, height: 10 },
      { resize: { mode: 'width', width: 50 }, allowUpscale: false },
      MAX,
    );
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe('normalizeOutput / isDefaultOutput', () => {
  it('clamps sizes, quality, and the pad color', () => {
    const n = normalizeOutput(
      {
        ...DEFAULT_OUTPUT,
        quality: 250,
        padColor: 'red',
        resize: { mode: 'exact', width: 999999, height: -4, fit: 'pad' },
      },
      MAX,
    );
    expect(n.quality).toBe(100);
    expect(n.padColor).toBe('#FFFFFF');
    expect(n.resize).toEqual({ mode: 'exact', width: MAX, height: 1, fit: 'pad' });
  });

  it('upper-cases a valid pad color and keeps untouched settings', () => {
    expect(normalizeOutput({ ...DEFAULT_OUTPUT, padColor: '#1a2b3c' }, MAX).padColor).toBe('#1A2B3C');
    expect(normalizeOutput(DEFAULT_OUTPUT, MAX)).toEqual(DEFAULT_OUTPUT);
  });

  it('recognizes the defaults', () => {
    expect(isDefaultOutput(DEFAULT_OUTPUT)).toBe(true);
    expect(isDefaultOutput({ ...DEFAULT_OUTPUT, format: 'jpeg' })).toBe(false);
    expect(isDefaultOutput({ ...DEFAULT_OUTPUT, resize: { mode: 'width', width: 800 } })).toBe(false);
  });
});
