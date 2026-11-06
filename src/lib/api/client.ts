import type { z } from 'zod';

import { apiErrorBodySchema } from './schemas';

/** Typed fetch wrapper (SKILLS.md §C.11): failures are values, not exceptions. */

export type ApiError = {
  /** Stable server error code, or `network_error` / `aborted` / `invalid_response` for client-side failures. */
  code: string;
  message: string;
  /** HTTP status; `0` when no response was received. */
  status: number;
};

export type Result<T, E = ApiError> = { ok: true; value: T } | { ok: false; error: E };

/** Transient failures worth retrying: no response, server errors, and rate limiting. */
export function isRetryableError(error: ApiError): boolean {
  return error.code === 'network_error' || error.status >= 500 || error.status === 429;
}

export async function apiRequest<S extends z.ZodType>(
  input: string,
  init: RequestInit,
  schema: S,
): Promise<Result<z.infer<S>>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (init.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { ok: false, error: { code: 'aborted', message: 'Cancelled', status: 0 } };
    }
    return { ok: false, error: { code: 'network_error', message: 'Could not reach the server', status: 0 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(body);
    return {
      ok: false,
      error: parsed.success
        ? { ...parsed.data.error, status: response.status }
        : { code: 'http_error', message: `Request failed (${response.status})`, status: response.status },
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'invalid_response', message: 'Unexpected response from the server', status: response.status },
    };
  }
  return { ok: true, value: parsed.data };
}
