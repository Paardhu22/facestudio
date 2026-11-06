import { describe, expect, it } from 'vitest';

import { DEFAULT_OUTPUT } from '@/lib/cropping/output';
import { exportFilename } from '@/lib/export/filenames';
import { parseByteRange } from '@/lib/export/range';
import { DEFAULT_EDIT } from '@/stores/edit-store';

const photo = { originalFilename: 'portrait.jpg', relativePath: 'team/portrait.jpg', mimeType: 'image/jpeg' as const };

describe('export archive names', () => {
  it('keeps original base names, uses the output format, and resolves case-insensitive collisions', () => {
    const used = new Set<string>();
    expect(exportFilename(photo, DEFAULT_EDIT, DEFAULT_OUTPUT, { width: 400, height: 500 }, false, used)).toBe(
      'portrait.jpg',
    );
    expect(
      exportFilename(
        { ...photo, originalFilename: 'PORTRAIT.JPG' },
        DEFAULT_EDIT,
        DEFAULT_OUTPUT,
        { width: 400, height: 500 },
        false,
        used,
      ),
    ).toBe('PORTRAIT_2.jpg');
    expect(
      exportFilename(
        photo,
        DEFAULT_EDIT,
        { ...DEFAULT_OUTPUT, format: 'png' },
        { width: 400, height: 500 },
        false,
        used,
      ),
    ).toBe('portrait.png');
  });
  it('expands tokens and optionally preserves safe folders', () => {
    expect(
      exportFilename(
        photo,
        DEFAULT_EDIT,
        { ...DEFAULT_OUTPUT, filenameTemplate: '{name}_{w}x{h}_{mode}_{n}' },
        { width: 200, height: 250 },
        true,
        new Set(),
      ),
    ).toBe('team/portrait_200x250_original_1.jpg');
  });
  it('prevents path traversal, drive letters, control characters, and empty names', () => {
    const name = exportFilename(
      { ...photo, relativePath: 'C:/../secret/portrait.jpg' },
      DEFAULT_EDIT,
      { ...DEFAULT_OUTPUT, filenameTemplate: '../../C:\\evil\u0000' },
      { width: 20, height: 20 },
      true,
      new Set(),
    );
    expect(name).not.toContain('..' + '/');
    expect(name).not.toMatch(/[:\\\u0000]/);
    expect(name.startsWith('/')).toBe(false);
  });
});

describe('download ranges', () => {
  it.each([
    ['bytes=0-9', { start: 0, end: 9 }],
    ['bytes=90-999', { start: 90, end: 99 }],
    ['bytes=95-', { start: 95, end: 99 }],
    ['bytes=-10', { start: 90, end: 99 }],
    ['bytes=-999', { start: 0, end: 99 }],
  ])('parses %s', (header, expected) => {
    expect(parseByteRange(header as string, 100)).toEqual(expected);
  });
  it.each(['bytes=100-', 'bytes=10-2', 'bytes=-0', 'bytes=', 'bytes=0-1,3-4', 'bytes=9007199254740994-', 'items=0-9'])(
    'rejects %s',
    (header) => expect(parseByteRange(header, 100)).toBeNull(),
  );
});
