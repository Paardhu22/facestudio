import { describe, expect, it } from 'vitest';

import { mergeIntoOrder, sortKeyFor } from '@/lib/library/sort';
import type { ImageId } from '@/types/domain';

import { imageId } from '../../fixtures/source-image';

function order(names: string[]): string[] {
  const ids = names.map((_, i) => imageId(i));
  const keys = Object.fromEntries(ids.map((id, i) => [id, sortKeyFor(names[i] ?? '')]));
  const merged = mergeIntoOrder([], ids, keys);
  return merged.map((id) => names[ids.indexOf(id)] ?? '');
}

describe('natural ordering', () => {
  it('sorts digit runs numerically, not lexically', () => {
    expect(order(['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg', 'IMG_100.jpg'])).toEqual([
      'IMG_1.jpg',
      'IMG_2.jpg',
      'IMG_10.jpg',
      'IMG_100.jpg',
    ]);
  });

  it('is case-insensitive and groups folders together', () => {
    expect(order(['b/2.jpg', 'A/10.jpg', 'a/9.jpg', 'B/1.jpg'])).toEqual(['a/9.jpg', 'A/10.jpg', 'B/1.jpg', 'b/2.jpg']);
  });

  it('treats very long digit runs without throwing', () => {
    expect(() => sortKeyFor(`x${'9'.repeat(40)}.jpg`)).not.toThrow();
  });
});

describe('mergeIntoOrder', () => {
  it('merges additions into an existing order and breaks ties by id deterministically', () => {
    const a = imageId(1);
    const b = imageId(2);
    const c = imageId(3);
    const keys: Record<string, string> = {
      [a]: sortKeyFor('same.jpg'),
      [b]: sortKeyFor('same.jpg'),
      [c]: sortKeyFor('a.jpg'),
    };
    expect(mergeIntoOrder([b], [a, c], keys)).toEqual([c, a, b]);
    expect(mergeIntoOrder([b], [c, a], keys)).toEqual([c, a, b]);
  });

  it('does not mutate its inputs', () => {
    const existing: ImageId[] = [imageId(1)];
    mergeIntoOrder(existing, [imageId(2)], {});
    expect(existing).toEqual([imageId(1)]);
  });
});
