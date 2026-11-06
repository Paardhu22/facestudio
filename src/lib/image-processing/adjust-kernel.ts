import type { ImageAdjustments } from '@/types/domain';

import { isNeutralAdjustments } from './adjustment-spec';

/**
 * Pixel kernel for the five adjustments (SKILLS.md §C.6, ADR-004). Pure TypeScript with no DOM or Node APIs,
 * so the browser preview worker and the server export run the SAME code and cannot drift apart.
 *
 * Pipeline (fixed order), on 8-bit sRGB data:
 *   1. decode sRGB → linear light (256-entry LUT)
 *   2. per-channel gain = exposure gain × luminance-normalized white-balance gain
 *   3. saturation around Rec.709 luminance, in linear light
 *   4. clamp each channel to [0, 1] (hard clip)
 *   5. encode linear → sRGB, with the brightness tone curve folded into the same LUT (65,536 entries)
 *   6. round to 8 bits. Alpha is never touched.
 */

const TEMPERATURE_STOPS = 0.35; // max ±EV-equivalent shift on the red/blue channels at ±100
const TINT_STOPS = 0.3; // max shift on the green channel at ±100
const BRIGHTNESS_EXPONENT_RANGE = 0.8; // gamma exponent = 2^(−0.8·b)

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

const ENCODE_LUT_SIZE = 65536;
const ENCODE_LUT_MAX = ENCODE_LUT_SIZE - 1;

const DECODE_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  DECODE_LUT[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function encodeSrgb(linear: number): number {
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
}

const encodeLutCache = new Map<number, Uint8Array>();
const ENCODE_CACHE_LIMIT = 8;

/** linear [0,1] (quantized to 16 bits) → brightness-adjusted sRGB byte. Cached per brightness value. */
export function getEncodeLut(brightness: number): Uint8Array {
  const cached = encodeLutCache.get(brightness);
  if (cached) return cached;

  const exponent = 2 ** (-BRIGHTNESS_EXPONENT_RANGE * (brightness / 100));
  const lut = new Uint8Array(ENCODE_LUT_SIZE);
  for (let i = 0; i < ENCODE_LUT_SIZE; i++) {
    const encoded = encodeSrgb(i / ENCODE_LUT_MAX);
    // x^exponent keeps 0 → 0 and 1 → 1, so black and white points stay fixed.
    lut[i] = Math.round(encoded ** exponent * 255);
  }
  if (encodeLutCache.size >= ENCODE_CACHE_LIMIT) encodeLutCache.clear();
  encodeLutCache.set(brightness, lut);
  return lut;
}

export type ChannelGains = { r: number; g: number; b: number };

/**
 * Exposure and white balance as per-channel linear gains. White-balance gains are normalized so that
 * `0.2126·gR + 0.7152·gG + 0.0722·gB = 1`: temperature and tint change hue, not overall luminance.
 */
export function computeGains(adjustments: Pick<ImageAdjustments, 'exposure' | 'temperature' | 'tint'>): ChannelGains {
  const exposure = 2 ** adjustments.exposure;
  const t = adjustments.temperature / 100;
  const u = adjustments.tint / 100;
  const wr = 2 ** (TEMPERATURE_STOPS * t);
  const wg = 2 ** (-TINT_STOPS * u);
  const wb = 2 ** (-TEMPERATURE_STOPS * t);
  const norm = LUMA_R * wr + LUMA_G * wg + LUMA_B * wb;
  return { r: (exposure * wr) / norm, g: (exposure * wg) / norm, b: (exposure * wb) / norm };
}

/** Saturation factor k in `c' = Y + k·(c − Y)`: −100 → 0 (grayscale), 0 → 1, +100 → 2. */
export const saturationFactor = (saturation: number): number => 1 + saturation / 100;

/**
 * Apply the adjustments to interleaved 8-bit pixels IN PLACE.
 * `channels` is 3 (RGB) or 4 (RGBA); the alpha channel is left untouched. All-default adjustments are a no-op.
 */
export function applyAdjustments(
  data: Uint8Array | Uint8ClampedArray,
  channels: 3 | 4,
  adjustments: ImageAdjustments,
): void {
  if (isNeutralAdjustments(adjustments)) return;

  const gains = computeGains(adjustments);
  const lut = getEncodeLut(adjustments.brightness);
  const length = data.length;

  if (adjustments.saturation === 0) {
    // Without saturation every channel is independent, so the whole pipeline is a 256-entry table per channel.
    const tables = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)] as const;
    const gainList = [gains.r, gains.g, gains.b] as const;
    for (let c = 0; c < 3; c++) {
      const table = tables[c];
      const gain = gainList[c];
      if (!table || gain === undefined) continue;
      for (let v = 0; v < 256; v++) {
        const linear = Math.min(1, (DECODE_LUT[v] ?? 0) * gain);
        table[v] = lut[(linear * ENCODE_LUT_MAX + 0.5) | 0] ?? 0;
      }
    }
    const [tr, tg, tb] = tables;
    for (let i = 0; i < length; i += channels) {
      data[i] = tr[data[i] ?? 0] ?? 0;
      data[i + 1] = tg[data[i + 1] ?? 0] ?? 0;
      data[i + 2] = tb[data[i + 2] ?? 0] ?? 0;
    }
    return;
  }

  const k = saturationFactor(adjustments.saturation);
  for (let i = 0; i < length; i += channels) {
    const r = (DECODE_LUT[data[i] ?? 0] ?? 0) * gains.r;
    const g = (DECODE_LUT[data[i + 1] ?? 0] ?? 0) * gains.g;
    const b = (DECODE_LUT[data[i + 2] ?? 0] ?? 0) * gains.b;
    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;

    let r2 = y + k * (r - y);
    let g2 = y + k * (g - y);
    let b2 = y + k * (b - y);
    r2 = r2 < 0 ? 0 : r2 > 1 ? 1 : r2;
    g2 = g2 < 0 ? 0 : g2 > 1 ? 1 : g2;
    b2 = b2 < 0 ? 0 : b2 > 1 ? 1 : b2;

    data[i] = lut[(r2 * ENCODE_LUT_MAX + 0.5) | 0] ?? 0;
    data[i + 1] = lut[(g2 * ENCODE_LUT_MAX + 0.5) | 0] ?? 0;
    data[i + 2] = lut[(b2 * ENCODE_LUT_MAX + 0.5) | 0] ?? 0;
  }
}
