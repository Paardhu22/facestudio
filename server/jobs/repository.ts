import 'server-only';

import type { createJobSchema, ExportJob } from '@/lib/api/jobs-schemas';
import { normalizeAdjustments } from '@/lib/image-processing/adjustment-spec';
import { normalizeCropShape } from '@/lib/cropping/build';
import { computeOutputSize, DEFAULT_OUTPUT, normalizeOutput } from '@/lib/cropping/output';
import { exportFilename } from '@/lib/export/filenames';
import type { ImageEdit, SessionId } from '@/types/domain';
import type { z } from 'zod';

import type { ServerContext } from '../context';
import { withTransaction } from '../db';
import { AppError } from '../errors';
import { getImage } from '../images/repository';
import { newId } from '../session';

type JobRow = {
  id: string;
  status: ExportJob['status'];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  package_token: string | null;
};

export function getJob(ctx: ServerContext, sessionId: string, id: string): ExportJob {
  const row = ctx.db.prepare('SELECT * FROM jobs WHERE id = ? AND session_id = ?').get(id, sessionId) as
    JobRow | undefined;
  if (!row) throw new AppError('not_found', 'Export not found.');
  const counts = ctx.db
    .prepare(
      `SELECT COUNT(*) AS items, COALESCE(SUM(status = 'done'),0) AS done,
    COALESCE(SUM(status = 'failed'),0) AS failed, COALESCE(SUM(status = 'cancelled'),0) AS cancelled
    FROM job_items WHERE job_id = ?`,
    )
    .get(id) as ExportJob['totals'];
  const artifact = ctx.db
    .prepare(
      `SELECT id, byte_size AS byteSize, file_count AS fileCount, expires_at AS expiresAt
    FROM artifacts WHERE job_id = ? AND expires_at > ?`,
    )
    .get(id, new Date().toISOString()) as ExportJob['artifact'] | undefined;
  const errors = ctx.db
    .prepare(
      `SELECT image_id AS imageId, filename, error_message AS message
    FROM job_items WHERE job_id = ? AND status = 'failed' ORDER BY seq LIMIT 100`,
    )
    .all(id) as ExportJob['errors'];
  return {
    id: row.id,
    kind: 'export',
    status: row.status,
    totals: counts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    phase: row.finished_at
      ? 'finished'
      : row.package_token
        ? 'packaging'
        : row.status === 'queued'
          ? 'queued'
          : 'rendering',
    artifact: artifact ?? null,
    errors,
  };
}

export function latestJob(ctx: ServerContext, sessionId: string): ExportJob | null {
  const row = ctx.db
    .prepare('SELECT id FROM jobs WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .get(sessionId) as { id: string } | undefined;
  return row ? getJob(ctx, sessionId, row.id) : null;
}

/** Snapshot on-screen instructions, including unsaved changes. Later edits cannot alter this export. */
export function createJob(ctx: ServerContext, sessionId: SessionId, body: z.infer<typeof createJobSchema>): ExportJob {
  if (body.items.length > ctx.limits.maxBatchImages)
    throw new AppError('invalid_request', 'This export exceeds the batch limit.');
  const jobId = newId('job');
  const now = new Date().toISOString();
  withTransaction(ctx.db, () => {
    const active = ctx.db
      .prepare("SELECT id FROM jobs WHERE session_id = ? AND status IN ('queued','running','cancelling')")
      .get(sessionId);
    if (active) throw new AppError('conflict', 'An export is already in progress.');
    ctx.db
      .prepare("INSERT INTO jobs(id,session_id,status,created_at) VALUES (?,?,'queued',?)")
      .run(jobId, sessionId, now);
    const used = new Set<string>();
    const ids = new Set<string>();
    const insert = ctx.db.prepare(
      `INSERT INTO job_items(id,job_id,image_id,source,edit,filename,status) VALUES (?,?,?,?,?,?,'queued')`,
    );
    for (const item of body.items) {
      if (ids.has(item.id)) continue;
      ids.add(item.id);
      const image = getImage(ctx, sessionId, item.id);
      if (!image)
        throw new AppError('not_found', 'An image is no longer available. Refresh your library and try again.');
      const crop = item.crop ? normalizeCropShape(item.crop, image) : null;
      const output = normalizeOutput(item.output ?? DEFAULT_OUTPUT, ctx.limits.maxOutputSide);
      const edit: ImageEdit = { adjustments: normalizeAdjustments(item.adjustments), crop, output };
      const size = computeOutputSize(crop?.rect ?? image, output, ctx.limits.maxOutputSide);
      if (size.width * size.height > ctx.limits.maxImagePixels)
        throw new AppError(
          'pixel_limit_exceeded',
          'The requested output has too many pixels. Choose smaller dimensions.',
        );
      insert.run(
        newId('itm'),
        jobId,
        image.id,
        JSON.stringify(image),
        JSON.stringify(edit),
        exportFilename(image, edit, output, size, body.preserveFolders, used),
      );
    }
  });
  return getJob(ctx, sessionId, jobId);
}

export function cancelJob(ctx: ServerContext, sessionId: string, id: string): ExportJob {
  withTransaction(ctx.db, () => {
    const job = getJob(ctx, sessionId, id);
    if (!['queued', 'running', 'cancelling'].includes(job.status))
      throw new AppError('conflict', 'This export has already finished.');
    ctx.db.prepare("UPDATE jobs SET status = 'cancelling' WHERE id = ?").run(id);
    ctx.db.prepare("UPDATE job_items SET status = 'cancelled' WHERE job_id = ? AND status = 'queued'").run(id);
    settleCancellation(ctx, id);
  });
  return getJob(ctx, sessionId, id);
}

export function settleCancellation(ctx: ServerContext, id: string): void {
  ctx.db
    .prepare(
      `UPDATE jobs SET status='cancelled',finished_at=?,package_token=NULL,package_lease=NULL
    WHERE id=? AND status='cancelling' AND NOT EXISTS(SELECT 1 FROM job_items WHERE job_id=? AND status='processing')`,
    )
    .run(new Date().toISOString(), id, id);
}

export async function retryJob(ctx: ServerContext, sessionId: string, id: string): Promise<ExportJob> {
  const oldKey = withTransaction(ctx.db, () => {
    const job = getJob(ctx, sessionId, id);
    if (!['failed', 'completed_with_errors'].includes(job.status))
      throw new AppError('conflict', 'Only failed exports can be retried.');
    if (
      ctx.db
        .prepare("SELECT id FROM jobs WHERE session_id=? AND id<>? AND status IN ('queued','running','cancelling')")
        .get(sessionId, id)
    )
      throw new AppError('conflict', 'Another export is already in progress.');
    const artifact = ctx.db.prepare('SELECT storage_key FROM artifacts WHERE job_id=?').get(id) as
      { storage_key: string } | undefined;
    ctx.db.prepare('DELETE FROM artifacts WHERE job_id=?').run(id);
    ctx.db
      .prepare(
        "UPDATE job_items SET status='queued',attempts=0,error_message=NULL,lease_token=NULL,lease_until=NULL WHERE job_id=? AND status='failed'",
      )
      .run(id);
    if (job.status === 'failed' && job.totals.failed === 0)
      ctx.db
        .prepare("UPDATE job_items SET status='queued',attempts=0,output_key=NULL WHERE job_id=? AND status='done'")
        .run(id);
    ctx.db
      .prepare(
        "UPDATE jobs SET status='queued',finished_at=NULL,error_message=NULL,package_token=NULL,package_lease=NULL WHERE id=?",
      )
      .run(id);
    return artifact?.storage_key;
  });
  if (oldKey) await ctx.storage.delete(oldKey);
  return getJob(ctx, sessionId, id);
}
