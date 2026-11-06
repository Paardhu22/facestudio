import type { ImageId } from '@/types/domain';

const PAD = 12;

/**
 * Natural, case-insensitive sort key: digit runs are zero-padded so `IMG_2` sorts before `IMG_10`.
 * Plain `<` comparison on these keys is fast enough to sort thousands of images on every upload flush.
 */
export function sortKeyFor(path: string): string {
  return path
    .normalize('NFC')
    .toLowerCase()
    .replace(/\d+/g, (digits) => (digits.length >= PAD ? digits : digits.padStart(PAD, '0')));
}

/** Merge new ids into an ordered list. Ties on the key fall back to the id, so the order is deterministic. */
export function mergeIntoOrder(
  order: readonly ImageId[],
  additions: readonly ImageId[],
  keys: Readonly<Record<string, string>>,
): ImageId[] {
  const merged = [...order, ...additions];
  merged.sort((a, b) => {
    const ka = keys[a] ?? '';
    const kb = keys[b] ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return merged;
}
