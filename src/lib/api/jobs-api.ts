import { apiRequest } from './client';
import { jobResponseSchema, latestJobResponseSchema } from './jobs-schemas';
import type { EditPayload } from './edits-api';

export const fetchLatestJob = (signal?: AbortSignal) =>
  apiRequest('/api/jobs', { method: 'GET', cache: 'no-store', signal }, latestJobResponseSchema);
export const fetchJob = (id: string, signal?: AbortSignal) =>
  apiRequest(`/api/jobs/${id}`, { method: 'GET', cache: 'no-store', signal }, jobResponseSchema);
export const startExport = (items: readonly EditPayload[], preserveFolders: boolean) =>
  apiRequest(
    '/api/jobs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items, preserveFolders }),
    },
    jobResponseSchema,
  );
export const changeJob = (id: string, action: 'cancel' | 'retry') =>
  apiRequest(`/api/jobs/${id}/${action}`, { method: 'POST' }, jobResponseSchema);
