import { describe, expect, it } from 'vitest';

import { hasSupportedExtension, sanitizeDisplayName, sanitizeRelativePath } from '@/lib/validation/filenames';

describe('hasSupportedExtension', () => {
  it.each(['a.jpg', 'a.JPEG', 'x.y.png', 'Photo.WebP'])('accepts %s', (name) => {
    expect(hasSupportedExtension(name)).toBe(true);
  });
  it.each(['a.gif', 'a.jpg.txt', '.DS_Store', 'jpg', 'a.heic', ''])('rejects %s', (name) => {
    expect(hasSupportedExtension(name)).toBe(false);
  });
});

describe('sanitizeDisplayName', () => {
  it('keeps ordinary names, including unicode', () => {
    expect(sanitizeDisplayName('IMG_0001.jpg')).toBe('IMG_0001.jpg');
    expect(sanitizeDisplayName('Zoë – team photo.png')).toBe('Zoë – team photo.png');
  });

  it('removes separators, control characters, and bidi overrides', () => {
    expect(sanitizeDisplayName('a/b\\c.jpg')).toBe('abc.jpg');
    expect(sanitizeDisplayName('a\u0000b\u0007c.jpg')).toBe('abc.jpg');
    expect(sanitizeDisplayName('evil‮gpj.jpg')).toBe('evilgpj.jpg');
  });

  it('never returns empty, dot, or dot-dot', () => {
    for (const raw of ['', '   ', '.', '..', '...', '///', '\u0000']) expect(sanitizeDisplayName(raw)).toBe('image');
  });

  it('collapses whitespace and normalizes unicode', () => {
    expect(sanitizeDisplayName('  a \t  b.jpg ')).toBe('a b.jpg');
    expect(sanitizeDisplayName('é.jpg')).toBe('é.jpg'); // NFC
  });

  it('truncates long names but keeps the extension', () => {
    const result = sanitizeDisplayName(`${'x'.repeat(500)}.jpeg`);
    expect(result).toHaveLength(200);
    expect(result.endsWith('.jpeg')).toBe(true);
  });
});

describe('sanitizeRelativePath', () => {
  it('keeps normal folder paths', () => {
    expect(sanitizeRelativePath('Team A/portraits/IMG_1.jpg')).toBe('Team A/portraits/IMG_1.jpg');
  });

  it('accepts backslash separators', () => {
    expect(sanitizeRelativePath('Team A\\IMG_1.jpg')).toBe('Team A/IMG_1.jpg');
  });

  it('drops traversal, current-dir, and empty segments so a path can never escape a root', () => {
    expect(sanitizeRelativePath('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRelativePath('/abs//path/./x.jpg')).toBe('abs/path/x.jpg');
    expect(sanitizeRelativePath('a/../../b.jpg')).toBe('a/b.jpg');
  });

  it('returns null when nothing usable remains', () => {
    for (const raw of ['', '/', '../..', './.', '\u0000/\u0001']) expect(sanitizeRelativePath(raw)).toBeNull();
  });

  it('bounds depth and total length', () => {
    const deep = Array.from({ length: 100 }, (_, i) => `d${i}`).join('/');
    expect(sanitizeRelativePath(deep)?.split('/')).toHaveLength(32);
    expect((sanitizeRelativePath(`${'a'.repeat(190)}/`.repeat(10) + 'f.jpg') ?? '').length).toBeLessThanOrEqual(512);
  });
});
