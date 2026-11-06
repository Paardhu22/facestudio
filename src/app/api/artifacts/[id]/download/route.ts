import { ARTIFACT_ID_PATTERN } from '@/lib/api/jobs-schemas';
import { getContext } from '@server/context';
import { AppError } from '@server/errors';
import { getSession, withErrors } from '@server/http';
import { downloadArtifact } from '@server/jobs/download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = getContext();
  const session = await getSession(ctx);
  if (!session || !ARTIFACT_ID_PATTERN.test(id)) throw new AppError('not_found', 'Download not found.');
  return downloadArtifact(ctx, session.sessionId, id, request);
});
export const HEAD = GET;
