import 'server-only';

import { z } from 'zod';

import { sourceImageSchema, adjustmentsSchema, cropSchema, outputSchema } from '@/lib/api/schemas';

import type { ServerContext } from '../context';
import { withTransaction } from '../db';
import { newId } from '../session';
import { LEASE_MS, type RenderTask } from './types';
import { settleCancellation } from './repository';

const snapshotSchema = z.object({
  adjustments: adjustmentsSchema,
  crop: cropSchema.nullable(),
  output: outputSchema.nullable(),
});
const INTERRUPTED = 'Processing was interrupted. Retry this export.';

type ItemRow = { id: string; job_id: string; image_id: string; source: string; edit: string; lease_token: string };

/** Recover abandoned leases without letting an older worker commit over a newer attempt. */
export function recoverLeases(ctx: ServerContext, now = Date.now()): void {
  ctx.db
    .prepare(
      `UPDATE job_items SET status=CASE
    WHEN job_id IN (SELECT id FROM jobs WHERE status='cancelling') THEN 'cancelled'
    WHEN attempts >= ? THEN 'failed' ELSE 'queued' END,
    lease_token=NULL,lease_until=NULL,error_message=? WHERE status='processing' AND lease_until < ?`,
    )
    .run(ctx.limits.maxAttempts, INTERRUPTED, now);
  ctx.db.prepare('UPDATE jobs SET package_token=NULL,package_lease=NULL WHERE package_lease < ?').run(now);
  const cancelling = ctx.db.prepare("SELECT id FROM jobs WHERE status='cancelling'").all() as { id: string }[];
  for (const { id } of cancelling) settleCancellation(ctx, id);
}

export function claimItem(ctx: ServerContext, now = Date.now()): RenderTask | null {
  return withTransaction(ctx.db, () => {
    const token = newId('run');
    const row = ctx.db
      .prepare(
        `UPDATE job_items SET status='processing',attempts=attempts+1,lease_token=?,lease_until=?
      WHERE id=(SELECT i.id FROM job_items i JOIN jobs j ON j.id=i.job_id
        WHERE i.status='queued' AND j.status IN ('queued','running') ORDER BY i.seq LIMIT 1) RETURNING *`,
      )
      .get(token, now + LEASE_MS) as ItemRow | undefined;
    if (!row) return null;
    const job = ctx.db.prepare('SELECT session_id FROM jobs WHERE id=?').get(row.job_id) as { session_id: string };
    ctx.db
      .prepare("UPDATE jobs SET status='running',started_at=COALESCE(started_at,?) WHERE id=?")
      .run(new Date(now).toISOString(), row.job_id);
    return {
      id: row.id,
      jobId: row.job_id,
      sessionId: job.session_id,
      leaseToken: token,
      image: sourceImageSchema.parse(JSON.parse(row.source)),
      edit: snapshotSchema.parse(JSON.parse(row.edit)),
      outputKey: `sessions/${job.session_id}/jobs/${row.job_id}/out/${row.id}-${token}`,
    };
  });
}

export function renewItem(ctx: ServerContext, task: RenderTask): void {
  ctx.db
    .prepare("UPDATE job_items SET lease_until=? WHERE id=? AND lease_token=? AND status='processing'")
    .run(Date.now() + LEASE_MS, task.id, task.leaseToken);
}

export function finishItem(ctx: ServerContext, task: RenderTask, success: boolean): boolean {
  const result = ctx.db
    .prepare(
      `UPDATE job_items SET status=CASE WHEN ? THEN 'done'
      WHEN job_id IN (SELECT id FROM jobs WHERE status='cancelling') THEN 'failed'
      WHEN attempts < ? THEN 'queued' ELSE 'failed' END,
    output_key=?,error_message=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=? AND status='processing'`,
    )
    .run(
      success ? 1 : 0,
      ctx.limits.maxAttempts,
      success ? task.outputKey : null,
      success ? null : 'The original image could not be read or rendered. Check the source and retry.',
      task.id,
      task.leaseToken,
    );
  settleCancellation(ctx, task.jobId);
  return Number(result.changes) === 1;
}

export function claimPackaging(ctx: ServerContext): { id: string; sessionId: string; token: string } | null {
  return withTransaction(ctx.db, () => {
    const row = ctx.db
      .prepare(
        `SELECT id,session_id FROM jobs j WHERE status IN ('queued','running') AND package_token IS NULL
      AND NOT EXISTS(SELECT 1 FROM job_items i WHERE i.job_id=j.id AND i.status IN ('queued','processing')) ORDER BY created_at LIMIT 1`,
      )
      .get() as { id: string; session_id: string } | undefined;
    if (!row) return null;
    const done = ctx.db.prepare("SELECT COUNT(*) AS n FROM job_items WHERE job_id=? AND status='done'").get(row.id) as {
      n: number;
    };
    if (!done.n) {
      ctx.db
        .prepare("UPDATE jobs SET status='failed',finished_at=?,error_message=? WHERE id=?")
        .run(new Date().toISOString(), 'No images could be exported. Review the errors and retry.', row.id);
      return null;
    }
    const token = newId('pkg');
    ctx.db
      .prepare("UPDATE jobs SET status='running',package_token=?,package_lease=? WHERE id=?")
      .run(token, Date.now() + LEASE_MS, row.id);
    return { id: row.id, sessionId: row.session_id, token };
  });
}
