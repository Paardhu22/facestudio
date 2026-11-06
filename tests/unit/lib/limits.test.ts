import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS, LIMIT_ENV_VARS, LimitsConfigError, resolveLimits } from '@/lib/config/limits';

describe('resolveLimits', () => {
  it('returns the documented defaults when no env vars are set', () => {
    const limits = resolveLimits({});
    expect(limits).toEqual(DEFAULT_LIMITS);
    expect(limits.maxBatchImages).toBe(3000);
    expect(limits.maxFileBytes).toBe(50 * 1024 * 1024);
    expect(limits.maxImagePixels).toBe(100_000_000);
    expect(limits.maxOutputSide).toBe(16_383);
  });

  it('applies valid integer overrides', () => {
    const limits = resolveLimits({ [LIMIT_ENV_VARS.maxBatchImages]: '500', [LIMIT_ENV_VARS.maxAttempts]: ' 5 ' });
    expect(limits.maxBatchImages).toBe(500);
    expect(limits.maxAttempts).toBe(5);
  });

  it('ignores empty values', () => {
    expect(resolveLimits({ FS_MAX_BATCH_IMAGES: '' }).maxBatchImages).toBe(3000);
  });

  it.each(['abc', '-5', '1.5', '0', '1e6'])(
    'rejects malformed value %s instead of silently weakening a limit',
    (raw) => {
      expect(() => resolveLimits({ FS_MAX_IMAGE_PIXELS: raw })).toThrow(LimitsConfigError);
    },
  );

  it('enforces hard format ceilings', () => {
    expect(() => resolveLimits({ FS_MAX_OUTPUT_SIDE: '20000' })).toThrow(/≤ 16383/);
  });

  it('does not mutate the shared defaults', () => {
    resolveLimits({ FS_MAX_BATCH_IMAGES: '10' });
    expect(DEFAULT_LIMITS.maxBatchImages).toBe(3000);
  });
});
