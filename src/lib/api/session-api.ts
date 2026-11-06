import { z } from 'zod';

import { apiRequest, type Result } from './client';

const okSchema = z.object({ ok: z.literal(true) });

/** Ensure this browser has a server session. Idempotent; see `POST /api/session` for why it exists. */
export function ensureSession(): Promise<Result<{ ok: true }>> {
  return apiRequest('/api/session', { method: 'POST' }, okSchema);
}
