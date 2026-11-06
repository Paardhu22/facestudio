import type { SupportedMimeType } from '@/types/domain';

/** Bytes needed to identify every supported format (WebP needs 12). */
export const SIGNATURE_BYTES = 12;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((value, i) => bytes[offset + i] === value);
}

/**
 * Identify an image by its leading bytes (SKILLS.md §D.10): JPEG `FF D8 FF`, PNG signature,
 * WebP `RIFF????WEBP`. File extensions and client-declared MIME types are never trusted.
 * Returns `null` for anything else, including inputs shorter than the signature.
 */
export function sniffImageType(bytes: Uint8Array): SupportedMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, PNG_MAGIC)) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  return null;
}

export const MIME_LABELS: Record<SupportedMimeType, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
};
