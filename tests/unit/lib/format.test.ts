import { describe, expect, it } from 'vitest';

import { formatBytes, formatCount, pluralize } from '@/lib/format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [10 * 1024, '10 KB'],
    [50 * 1024 * 1024, '50 MB'],
    [15 * 1024 ** 3, '15 GB'],
  ])('%i → %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('shows a dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('formatCount / pluralize', () => {
  it('groups thousands', () => {
    expect(formatCount(3000)).toBe('3,000');
  });
  it('pluralizes correctly, including exactly one and zero', () => {
    expect(pluralize(1, 'image')).toBe('1 image');
    expect(pluralize(0, 'image')).toBe('0 images');
    expect(pluralize(2500, 'image')).toBe('2,500 images');
    expect(pluralize(2, 'non-image file')).toBe('2 non-image files');
  });
});
