import { createJobSchema } from '@/lib/api/jobs-schemas';
import { getContext } from '@server/context';
import { AppError } from '@server/errors';
import { assertSameOrigin, getSession, withErrors } from '@server/http';
import { createJob, latestJob } from '@server/jobs/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export const GET = withErrors(async () => {
  const ctx = getContext();
  const session = await getSession(ctx);
  return Response.json({ job: session ? latestJob(ctx, session.sessionId) : null }, { headers });
});
export const POST = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = getContext();
  const session = await getSession(ctx);
  if (!session) throw new AppError('not_found', 'No images are available to export.');
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('invalid_request', 'Expected export settings.');
  }
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) throw new AppError('invalid_request', 'Choose images and valid export settings.');
  return Response.json({ job: createJob(ctx, session.sessionId, parsed.data) }, { status: 202, headers });
});
