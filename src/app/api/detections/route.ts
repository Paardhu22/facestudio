import { putDetectionsRequestSchema } from '@/lib/api/schemas';
import { getContext } from '@server/context';
import { listDetections, saveDetections } from '@server/detections/repository';
import { AppError } from '@server/errors';
import { assertSameOrigin, getSession, withErrors } from '@server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** The caller's cached face-detection results, keyed by image id. */
export const GET = withErrors(async () => {
  const ctx = getContext();
  const session = await getSession(ctx);
  return Response.json({ detections: session ? listDetections(ctx, session.sessionId) : {} }, { headers: NO_STORE });
});

/** Store detection results computed in the browser (ADR-002). Results for images the caller does not own are ignored. */
export const PUT = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = getContext();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError('invalid_request', 'Expected a JSON body.');
  }
  const body = putDetectionsRequestSchema.safeParse(payload);
  if (!body.success) throw new AppError('invalid_request', 'Expected { items: [{ id, result }] }.');

  const session = await getSession(ctx);
  const stored = session ? saveDetections(ctx, session.sessionId, body.data.items) : 0;
  return Response.json({ stored }, { headers: NO_STORE });
});
