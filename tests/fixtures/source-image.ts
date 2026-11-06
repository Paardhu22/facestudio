import type { ImageId, SourceImage } from '@/types/domain';

/** Deterministic id matching the real `img_` + 22 base64url chars format. */
export function imageId(n: number): ImageId {
  return `img_${n.toString().padStart(22, '0')}`;
}

export function makeSourceImage(n: number, overrides: Partial<SourceImage> = {}): SourceImage {
  return {
    id: imageId(n),
    originalFilename: `IMG_${n}.jpg`,
    relativePath: null,
    mimeType: 'image/jpeg',
    byteSize: 1000 + n,
    width: 400,
    height: 300,
    orientation: 1,
    hasAlpha: false,
    contentHash: n.toString(16).padStart(64, '0'),
    duplicateOfId: null,
    renditions: { thumb: { width: 384, height: 288 }, preview: { width: 400, height: 300 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
