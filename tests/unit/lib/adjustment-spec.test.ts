import { describe, expect, it } from 'vitest';

import {
  ADJUSTMENT_ORDER,
  ADJUSTMENT_SPEC,
  DEFAULT_ADJUSTMENTS,
  formatAdjustment,
  isNeutralAdjustments,
  normalizeAdjustment,
  normalizeAdjustments,
} from '@/lib/image-processing/adjustment-spec';

describe('adjustment spec', () => {
  it('defines the five controls in the documented order with ranges from SKILLS.md §C.6', () => {
    expect(ADJUSTMENT_ORDER).toEqual(['exposure', 'temperature', 'tint', 'saturation', 'brightness']);
    expect(ADJUSTMENT_SPEC.exposure).toMatchObject({ min: -3, max: 3, step: 0.01, defaultValue: 0, unit: 'EV' });
    for (const key of ['temperature', 'tint', 'saturation', 'brightness'] as const) {
      expect(ADJUSTMENT_SPEC[key]).toMatchObject({ min: -100, max: 100, step: 1, defaultValue: 0 });
    }
  });

  it('keeps every default inside its range', () => {
    for (const key of ADJUSTMENT_ORDER) {
      const def = ADJUSTMENT_SPEC[key];
      expect(def.defaultValue).toBeGreaterThanOrEqual(def.min);
      expect(def.defaultValue).toBeLessThanOrEqual(def.max);
    }
  });

  it('clamps out-of-range values', () => {
    expect(normalizeAdjustment('exposure', 9)).toBe(3);
    expect(normalizeAdjustment('exposure', -9)).toBe(-3);
    expect(normalizeAdjustment('tint', 250)).toBe(100);
  });

  it('snaps to the step grid without float drift', () => {
    expect(normalizeAdjustment('exposure', 0.1 + 0.2)).toBe(0.3);
    expect(normalizeAdjustment('exposure', 1.23456)).toBe(1.23);
    expect(normalizeAdjustment('saturation', 12.6)).toBe(13);
  });

  it('maps non-finite input to the default and never returns -0', () => {
    expect(normalizeAdjustment('brightness', Number.NaN)).toBe(0);
    expect(normalizeAdjustment('temperature', Number.POSITIVE_INFINITY)).toBe(0);
    expect(Object.is(normalizeAdjustment('exposure', -0.001), -0)).toBe(false);
  });

  it('normalizes partial sets, filling defaults', () => {
    expect(normalizeAdjustments({ exposure: 5, tint: -12.4 })).toEqual({
      ...DEFAULT_ADJUSTMENTS,
      exposure: 3,
      tint: -12,
    });
  });

  it('detects neutral adjustment sets (export fast path)', () => {
    expect(isNeutralAdjustments({ ...DEFAULT_ADJUSTMENTS })).toBe(true);
    expect(isNeutralAdjustments({ ...DEFAULT_ADJUSTMENTS, saturation: 1 })).toBe(false);
  });

  it('formats values with sign, precision, unit, and a true minus sign', () => {
    expect(formatAdjustment('exposure', 0.5)).toBe('+0.50 EV');
    expect(formatAdjustment('exposure', -1.25)).toBe('−1.25 EV');
    expect(formatAdjustment('tint', 0)).toBe('0');
    expect(formatAdjustment('temperature', 12)).toBe('+12');
  });
});
