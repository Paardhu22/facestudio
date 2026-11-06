import { describe, expect, it } from 'vitest';

import { SIGNATURE_BYTES, sniffImageType } from '@/lib/validation/image-signature';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from(Array.from(text, (c) => c.charCodeAt(0)));

describe('sniffImageType', () => {
  it('identifies JPEG, PNG, and WebP by magic bytes', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe('image/png');
    const webp = new Uint8Array(12);
    webp.set(ascii('RIFF'), 0);
    webp.set(ascii('WEBP'), 8);
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejects other formats even when a lookalike prefix matches', () => {
    expect(sniffImageType(ascii('GIF89a......'))).toBeNull();
    expect(sniffImageType(ascii('BM..........'))).toBeNull(); // BMP
    expect(sniffImageType(ascii('%PDF-1.7....'))).toBeNull();
    expect(sniffImageType(ascii('<svg xmlns=..'))).toBeNull();
    // RIFF container that is not WebP (for example WAV or AVI)
    const wav = new Uint8Array(12);
    wav.set(ascii('RIFF'), 0);
    wav.set(ascii('WAVE'), 8);
    expect(sniffImageType(wav)).toBeNull();
    // PNG signature truncated by one byte
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a))).toBeNull();
  });

  it('returns null for empty and too-short inputs', () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
  });

  it('needs no more than SIGNATURE_BYTES to decide', () => {
    expect(SIGNATURE_BYTES).toBe(12);
  });
});
