import type { ImageId, SourceImage } from '@/types/domain';

import { apiRequest, type Result } from './client';
import {
  deleteImagesResponseSchema,
  listResponseSchema,
  sourceImageSchema,
  UPLOAD_HEADERS,
  type ListResponse,
} from './schemas';

/** Browser-side wrappers for `/api/images`. Each returns a `Result`; none throws. */

export function fetchImagePage(cursor: string | null, signal?: AbortSignal): Promise<Result<ListResponse>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiRequest(`/api/images${query}`, { method: 'GET', signal, cache: 'no-store' }, listResponseSchema);
}

/**
 * Upload one image as a raw body. The file is streamed by the browser, never read into JS memory.
 * Names travel in percent-encoded headers because the body is the image itself.
 */
export function uploadImage(
  file: File,
  relativePath: string | null,
  signal?: AbortSignal,
): Promise<Result<SourceImage>> {
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
    [UPLOAD_HEADERS.filename]: encodeURIComponent(file.name),
  };
  if (relativePath) headers[UPLOAD_HEADERS.relativePath] = encodeURIComponent(relativePath);
  return apiRequest('/api/images', { method: 'POST', headers, body: file, signal }, sourceImageSchema);
}

export function deleteImages(ids: readonly ImageId[]): Promise<Result<{ deleted: ImageId[] }>> {
  return apiRequest(
    '/api/images',
    { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) },
    deleteImagesResponseSchema,
  );
}

export const thumbUrl = (id: ImageId): string => `/api/images/${id}/thumb`;
export const previewUrl = (id: ImageId): string => `/api/images/${id}/preview`;
