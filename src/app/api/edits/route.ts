import { patchEditsRequestSchema } from '@/lib/api/schemas';
import { getContext } from '@server/context';
import { listEdits, saveEdits } from '@server/edits/repository';
import { AppError } from '@server/errors';
import { assertSameOrigin, getSession, withErrors } from '@server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** The caller's non-default adjustments, keyed by image id. */
export const GET = withErrors(async () => {
  const ctx = getContext();
  const session = await getSession(ctx);
  return Response.json({ edits: session ? listEdits(ctx, session.sessionId) : {} }, { headers: NO_STORE });
});

/** Save adjustments for one or many images in one request. Neutral values clear the image's edit. */
export const PATCH = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = getContext();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError('invalid_request', 'Expected a JSON body.');
  }
  const body = patchEditsRequestSchema.safeParse(payload);
  if (!body.success)
    throw new AppError('invalid_request', 'Expected { items: [{ id, adjustments }] } within the allowed ranges.');

  const session = await getSession(ctx);
  const updated = session ? saveEdits(ctx, session.sessionId, body.data.items) : 0;
  return Response.json({ updated }, { headers: NO_STORE });
});
