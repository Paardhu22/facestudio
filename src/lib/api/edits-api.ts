import type { DetectionResult, ImageAdjustments, ImageEdit, ImageId, CropRegion, OutputSettings } from '@/types/domain';

import { apiRequest, type Result } from './client';
import {
  listDetectionsResponseSchema,
  listEditsResponseSchema,
  patchEditsResponseSchema,
  putDetectionsResponseSchema,
} from './schemas';

export type EditPayload = {
  id: ImageId;
  adjustments: ImageAdjustments;
  crop: CropRegion | null;
  output: OutputSettings | null;
};

export function fetchEdits(signal?: AbortSignal): Promise<Result<Record<ImageId, ImageEdit>>> {
  return apiRequest('/api/edits', { method: 'GET', signal, cache: 'no-store' }, listEditsResponseSchema).then(
    (result) => (result.ok ? { ok: true, value: result.value.edits as Record<ImageId, ImageEdit> } : result),
  );
}

export function patchEdits(items: readonly EditPayload[]): Promise<Result<{ updated: number }>> {
  return apiRequest(
    '/api/edits',
    { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) },
    patchEditsResponseSchema,
  );
}

export function fetchDetections(signal?: AbortSignal): Promise<Result<Record<ImageId, DetectionResult>>> {
  return apiRequest('/api/detections', { method: 'GET', signal, cache: 'no-store' }, listDetectionsResponseSchema).then(
    (result) => (result.ok ? { ok: true, value: result.value.detections as Record<ImageId, DetectionResult> } : result),
  );
}

export function putDetections(
  items: readonly { id: ImageId; result: DetectionResult }[],
): Promise<Result<{ stored: number }>> {
  return apiRequest(
    '/api/detections',
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) },
    putDetectionsResponseSchema,
  );
}
