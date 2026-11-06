import { JOB_ID_PATTERN } from '@/lib/api/jobs-schemas';
import { getContext } from '@server/context';
import { AppError } from '@server/errors';
import { assertSameOrigin, getSession, withErrors } from '@server/http';
import { cancelJob, retryJob } from '@server/jobs/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = withErrors(
  async (request: Request, { params }: { params: Promise<{ id: string; action: string }> }) => {
    assertSameOrigin(request);
    const { id, action } = await params;
    const ctx = getContext();
    const session = await getSession(ctx);
    if (!session || !JOB_ID_PATTERN.test(id) || !['cancel', 'retry'].includes(action))
      throw new AppError('not_found', 'Export not found.');
    const job =
      action === 'cancel' ? cancelJob(ctx, session.sessionId, id) : await retryJob(ctx, session.sessionId, id);
    return Response.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
  },
);
