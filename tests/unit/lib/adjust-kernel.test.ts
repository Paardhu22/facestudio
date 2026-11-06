// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { applyAdjustments, computeGains, getEncodeLut, saturationFactor } from '@/lib/image-processing/adjust-kernel';
import { DEFAULT_ADJUSTMENTS } from '@/lib/image-processing/adjustment-spec';
import type { ImageAdjustments } from '@/types/domain';

const adj = (patch: Partial<ImageAdjustments>): ImageAdjustments => ({ ...DEFAULT_ADJUSTMENTS, ...patch });

/** One RGB pixel through the kernel. */
function px(rgb: [number, number, number], patch: Partial<ImageAdjustments>): [number, number, number] {
  const data = Uint8Array.from(rgb);
  applyAdjustments(data, 3, adj(patch));
  return [data[0] ?? -1, data[1] ?? -1, data[2] ?? -1];
}

// Independent reference implementation of the IEC 61966-2-1 transfer functions (piecewise, including the linear toe).
const srgbToLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (l: number) => Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255);

describe('neutral and structural behavior', () => {
  it('all-default adjustments leave every byte untouched', () => {
    const data = Uint8Array.from({ length: 4 * 256 }, (_, i) => i % 256);
    const before = Uint8Array.from(data);
    applyAdjustments(data, 4, DEFAULT_ADJUSTMENTS);
    expect(data).toEqual(before);
  });

  it('never modifies alpha, and handles RGB and RGBA strides', () => {
    const rgba = Uint8Array.from([10, 200, 90, 17, 250, 3, 77, 255]);
    applyAdjustments(rgba, 4, adj({ exposure: 1, saturation: 40, brightness: 20, tint: 30 }));
    expect(rgba[3]).toBe(17);
    expect(rgba[7]).toBe(255);

    const rgb = Uint8Array.from([10, 200, 90, 250, 3, 77]);
    applyAdjustments(rgb, 3, adj({ exposure: 1 }));
    expect(rgb).toHaveLength(6);
  });

  it('is deterministic', () => {
    const make = () => Uint8Array.from({ length: 3 * 1000 }, (_, i) => (i * 37) % 256);
    const a = make();
    const b = make();
    const settings = adj({ exposure: 0.7, temperature: -35, tint: 12, saturation: 25, brightness: -15 });
    applyAdjustments(a, 3, settings);
    applyAdjustments(b, 3, settings);
    expect(a).toEqual(b);
  });

  it('the saturation fast path (saturation = 0) matches the general path at saturation ≈ 0', () => {
    const base = Uint8Array.from({ length: 3 * 4096 }, (_, i) => (i * 53 + (i >> 4)) % 256);
    const settings = { exposure: 0.8, temperature: 22, tint: -9, brightness: 17 };
    const fast = Uint8Array.from(base);
    applyAdjustments(fast, 3, adj({ ...settings, saturation: 0 }));

    // k = 1.0 exactly via the general path: force it by using a tiny saturation and compare loosely.
    const general = Uint8Array.from(base);
    applyAdjustments(general, 3, adj({ ...settings, saturation: 0.001 }));
    let maxDiff = 0;
    for (let i = 0; i < fast.length; i++) maxDiff = Math.max(maxDiff, Math.abs((fast[i] ?? 0) - (general[i] ?? 0)));
    expect(maxDiff).toBeLessThanOrEqual(1);
  });
});

describe('exposure', () => {
  it('+1 EV doubles linear light: mid-gray 128 → the sRGB value of 2 × its linear value', () => {
    const expected = linearToSrgb(srgbToLinear(128) * 2);
    const [r, g, b] = px([128, 128, 128], { exposure: 1 });
    for (const v of [r, g, b]) expect(Math.abs(v - expected)).toBeLessThanOrEqual(1);
  });

  it('−1 EV halves linear light', () => {
    const expected = linearToSrgb(srgbToLinear(200) / 2);
    expect(Math.abs(px([200, 200, 200], { exposure: -1 })[0] - expected)).toBeLessThanOrEqual(1);
  });

  it('is monotonic and clips highlights hard at white', () => {
    const values = [-3, -1, 0, 1, 3].map((exposure) => px([100, 100, 100], { exposure })[0]);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(px([250, 250, 250], { exposure: 3 })).toEqual([255, 255, 255]);
  });

  it('keeps pure black and pure white fixed for non-positive exposure of black', () => {
    expect(px([0, 0, 0], { exposure: 3 })).toEqual([0, 0, 0]);
    expect(px([255, 255, 255], { exposure: -3 })[0]).toBeLessThan(255);
  });
});

describe('temperature and tint', () => {
  it('warm (+) raises red and lowers blue; cool (−) does the opposite; green barely moves', () => {
    const [r, g, b] = px([128, 128, 128], { temperature: 60 });
    expect(r).toBeGreaterThan(128);
    expect(b).toBeLessThan(128);
    expect(Math.abs(g - 128)).toBeLessThan(Math.abs(r - 128));
    const [cr, , cb] = px([128, 128, 128], { temperature: -60 });
    expect(cr).toBeLessThan(128);
    expect(cb).toBeGreaterThan(128);
  });

  it('tint + (magenta) lowers green; tint − (green) raises it', () => {
    expect(px([128, 128, 128], { tint: 60 })[1]).toBeLessThan(128);
    expect(px([128, 128, 128], { tint: -60 })[1]).toBeGreaterThan(128);
  });

  it('white-balance gains preserve luminance (normalized): Y(gains) = 1, so hue shifts without brightening', () => {
    for (const [temperature, tint] of [
      [100, 0],
      [-100, 0],
      [0, 100],
      [0, -100],
      [70, -40],
    ] as const) {
      const g = computeGains({ exposure: 0, temperature, tint });
      expect(0.2126 * g.r + 0.7152 * g.g + 0.0722 * g.b).toBeCloseTo(1, 10);
    }
  });

  it('exposure multiplies the normalized white-balance gains', () => {
    const base = computeGains({ exposure: 0, temperature: 40, tint: -20 });
    const lifted = computeGains({ exposure: 1, temperature: 40, tint: -20 });
    expect(lifted.r / base.r).toBeCloseTo(2, 10);
    expect(lifted.g / base.g).toBeCloseTo(2, 10);
    expect(lifted.b / base.b).toBeCloseTo(2, 10);
  });
});

describe('saturation', () => {
  it('−100 gives exact grayscale equal to the linear Rec.709 luminance', () => {
    const [r, g, b] = px([200, 60, 30], { saturation: -100 });
    expect(r).toBe(g);
    expect(g).toBe(b);
    const y = 0.2126 * srgbToLinear(200) + 0.7152 * srgbToLinear(60) + 0.0722 * srgbToLinear(30);
    expect(Math.abs(r - linearToSrgb(y))).toBeLessThanOrEqual(1);
  });

  it('+ increases channel spread, − decreases it; neutral grays are unaffected', () => {
    const spread = ([r, g, b]: [number, number, number]) => Math.max(r, g, b) - Math.min(r, g, b);
    const base: [number, number, number] = [180, 120, 90];
    expect(spread(px(base, { saturation: 50 }))).toBeGreaterThan(spread(base));
    expect(spread(px(base, { saturation: -50 }))).toBeLessThan(spread(base));
    expect(px([128, 128, 128], { saturation: 100 })).toEqual([128, 128, 128]);
  });

  it('saturation factor is 1 + S/100', () => {
    expect([-100, 0, 100].map(saturationFactor)).toEqual([0, 1, 2]);
  });

  it('clamps out-of-gamut results to [0, 255] instead of wrapping', () => {
    for (const v of px([255, 10, 10], { saturation: 100, exposure: 1 })) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('brightness', () => {
  it('keeps black and white points fixed at any setting', () => {
    for (const brightness of [-100, -37, 37, 100]) {
      expect(px([0, 0, 0], { brightness })).toEqual([0, 0, 0]);
      expect(px([255, 255, 255], { brightness })).toEqual([255, 255, 255]);
    }
  });

  it('+ lifts midtones, − lowers them, and is monotonic across the tonal range', () => {
    expect(px([128, 128, 128], { brightness: 50 })[0]).toBeGreaterThan(128);
    expect(px([128, 128, 128], { brightness: -50 })[0]).toBeLessThan(128);
    const lut = getEncodeLut(40);
    for (let i = 1; i < lut.length; i++) expect(lut[i] ?? 0).toBeGreaterThanOrEqual(lut[i - 1] ?? 0);
  });

  it('brightness 0 is the identity encode (sRGB round trip within one code value)', () => {
    const lut = getEncodeLut(0);
    for (let v = 0; v < 256; v += 5) {
      const index = Math.round(srgbToLinear(v) * 65535);
      expect(Math.abs((lut[index] ?? 0) - v)).toBeLessThanOrEqual(1);
    }
  });
});

describe('preview/export consistency (ADR-004)', () => {
  it('adjusting then downscaling matches downscaling then adjusting within 2/255 mean error', async () => {
    // A smooth, colorful gradient so downscale filters and the nonlinear pipeline both matter.
    const width = 256;
    const height = 192;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        raw[i] = Math.round((x / (width - 1)) * 255);
        raw[i + 1] = Math.round((y / (height - 1)) * 255);
        raw[i + 2] = Math.round(((x + y) / (width + height - 2)) * 255);
      }
    }
    const settings = adj({ exposure: 0.6, temperature: 30, tint: -15, saturation: 20, brightness: 12 });
    const shrink = async (buffer: Buffer, w: number, h: number) =>
      sharp(buffer, { raw: { width: w, height: h, channels: 3 } })
        .resize(64, 48, { kernel: 'lanczos3' })
        .raw()
        .toBuffer();

    const adjustedFull = Uint8Array.from(raw);
    applyAdjustments(adjustedFull, 3, settings);
    const adjustThenShrink = await shrink(Buffer.from(adjustedFull), width, height);

    const shrunk = Uint8Array.from(await shrink(raw, width, height));
    applyAdjustments(shrunk, 3, settings);

    let total = 0;
    for (let i = 0; i < shrunk.length; i++) total += Math.abs((shrunk[i] ?? 0) - (adjustThenShrink[i] ?? 0));
    expect(total / shrunk.length).toBeLessThanOrEqual(2);
  });
});
