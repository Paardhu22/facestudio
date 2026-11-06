import { JOB_ID_PATTERN } from '@/lib/api/jobs-schemas';
import { getContext } from '@server/context';
import { AppError } from '@server/errors';
import { getSession, withErrors } from '@server/http';
import { getJob } from '@server/jobs/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withErrors(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = getContext();
  const session = await getSession(ctx);
  if (!session || !JOB_ID_PATTERN.test(id)) throw new AppError('not_found', 'Export not found.');
  return Response.json({ job: getJob(ctx, session.sessionId, id) }, { headers: { 'Cache-Control': 'no-store' } });
});
