/**
 * Shared adjustment specification (SKILLS.md §C.6, ADR-004).
 *
 * Ranges, steps, and defaults for the five tonal/color controls. The pixel kernel (Phase 4)
 * and every UI control derive their bounds from this single table so client and server can
 * never disagree about valid values.
 */

import type { ImageAdjustments } from '@/types/domain';

export type AdjustmentKey = keyof ImageAdjustments;

export type AdjustmentDefinition = {
  readonly key: AdjustmentKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  /** Decimal places shown in numeric readouts. */
  readonly precision: number;
  /** Unit suffix for display and `aria-valuetext` (empty for unitless). */
  readonly unit: string;
};

export const ADJUSTMENT_ORDER = [
  'exposure',
  'temperature',
  'tint',
  'saturation',
  'brightness',
] as const satisfies readonly AdjustmentKey[];

export const ADJUSTMENT_SPEC: Readonly<Record<AdjustmentKey, AdjustmentDefinition>> = {
  exposure: {
    key: 'exposure',
    label: 'Exposure',
    min: -3,
    max: 3,
    step: 0.01,
    defaultValue: 0,
    precision: 2,
    unit: 'EV',
  },
  temperature: {
    key: 'temperature',
    label: 'Temperature',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    precision: 0,
    unit: '',
  },
  tint: { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, defaultValue: 0, precision: 0, unit: '' },
  saturation: {
    key: 'saturation',
    label: 'Saturation',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    precision: 0,
    unit: '',
  },
  brightness: {
    key: 'brightness',
    label: 'Brightness',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    precision: 0,
    unit: '',
  },
};

export const DEFAULT_ADJUSTMENTS: Readonly<ImageAdjustments> = Object.freeze({
  exposure: ADJUSTMENT_SPEC.exposure.defaultValue,
  temperature: ADJUSTMENT_SPEC.temperature.defaultValue,
  tint: ADJUSTMENT_SPEC.tint.defaultValue,
  saturation: ADJUSTMENT_SPEC.saturation.defaultValue,
  brightness: ADJUSTMENT_SPEC.brightness.defaultValue,
});

/** Clamp to range and snap to the control's step grid (prevents float drift such as 0.30000000000000004). */
export function normalizeAdjustment(key: AdjustmentKey, value: number): number {
  const def = ADJUSTMENT_SPEC[key];
  if (!Number.isFinite(value)) return def.defaultValue;
  const clamped = Math.min(def.max, Math.max(def.min, value));
  const snapped = Math.round(clamped / def.step) * def.step;
  const factor = 10 ** def.precision;
  const rounded = Math.round(snapped * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Normalize every field of an adjustment set. Unknown or missing fields fall back to defaults. */
export function normalizeAdjustments(input: Partial<ImageAdjustments>): ImageAdjustments {
  const out = { ...DEFAULT_ADJUSTMENTS };
  for (const key of ADJUSTMENT_ORDER) {
    const value = input[key];
    if (typeof value === 'number') out[key] = normalizeAdjustment(key, value);
  }
  return out;
}

/** True when all values equal their defaults; the export pipeline then skips the pixel pass entirely. */
export function isNeutralAdjustments(adjustments: ImageAdjustments): boolean {
  return ADJUSTMENT_ORDER.every((key) => adjustments[key] === ADJUSTMENT_SPEC[key].defaultValue);
}

/** Human-readable value with sign and unit, e.g. "+0.50 EV", "−12", "0". Uses a true minus sign. */
export function formatAdjustment(key: AdjustmentKey, value: number): string {
  const def = ADJUSTMENT_SPEC[key];
  const v = normalizeAdjustment(key, value);
  const abs = Math.abs(v).toFixed(def.precision);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${abs}${def.unit ? ` ${def.unit}` : ''}`;
}
