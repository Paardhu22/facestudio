import { getContext } from '@server/context';
import { assertSameOrigin, clearSessionCookie, getOrCreateSession, getSession, withErrors } from '@server/http';
import { deleteSession } from '@server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Make sure this browser has a session (create one if needed). Idempotent. The upload queue calls this ONCE
 * before sending parallel uploads: concurrent first requests would otherwise each create their own session,
 * splitting one batch across several sessions.
 */
export const POST = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  await getOrCreateSession(getContext());
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});

/** Delete everything this browser has stored: all images, renditions, and the session itself. */
export const DELETE = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = getContext();
  const session = await getSession(ctx);
  if (session) await deleteSession(ctx, session.sessionId);
  await clearSessionCookie();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
});
