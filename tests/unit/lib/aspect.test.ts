import { describe, expect, it } from 'vitest';

import { ASPECT_PRESETS, makeAspect, parseRatioText, resolveAspect } from '@/lib/cropping/aspect';

const image = { width: 3000, height: 2000 };

describe('resolveAspect', () => {
  it.each([
    ['1:1', 1],
    ['4:5', 0.8],
    ['3:4', 0.75],
    ['2:3', 2 / 3],
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
  ] as const)('%s → %d', (preset, ratio) => {
    expect(resolveAspect(makeAspect(preset), image)).toBeCloseTo(ratio, 12);
  });

  it('original follows the image; free is unconstrained', () => {
    expect(resolveAspect(makeAspect('original'), image)).toBeCloseTo(1.5, 12);
    expect(resolveAspect(makeAspect('free'), image)).toBeNull();
  });

  it('custom uses its ratio, clamped to a sane range; an invalid custom ratio is treated as free', () => {
    expect(resolveAspect(makeAspect('custom', 1.25), image)).toBe(1.25);
    expect(resolveAspect(makeAspect('custom', 1000), image)).toBe(10);
    expect(resolveAspect(makeAspect('custom', 0.0001), image)).toBe(0.1);
    expect(resolveAspect({ preset: 'custom', value: null }, image)).toBeNull();
    expect(resolveAspect({ preset: 'custom', value: Number.NaN }, image)).toBeNull();
  });

  it('every documented preset exists', () => {
    expect([...ASPECT_PRESETS]).toEqual(['1:1', '4:5', '3:4', '2:3', '9:16', '16:9', 'original', 'free', 'custom']);
  });
});

describe('parseRatioText', () => {
  it.each([
    ['4:5', 0.8],
    ['16/9', 16 / 9],
    ['3x2', 1.5],
    ['1.25', 1.25],
    ['1,25', 1.25],
    [' 2 : 1 ', 2],
  ])('parses %s', (text, ratio) => {
    expect(parseRatioText(text)).toBeCloseTo(ratio, 12);
  });
  it.each(['', 'abc', '0:5', '4:0', '-1', '1:2:3', '100', '0.001'])('rejects %s', (text) => {
    expect(parseRatioText(text)).toBeNull();
  });
});
