import 'server-only';

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { ZipFile } from 'yazl';

import type { ServerContext } from '../context';
import { withTransaction } from '../db';
import { newId, sweepExpiredSessions } from '../session';
import { LEASE_MS } from './types';

type Package = { id: string; sessionId: string; token: string };

export async function packageJob(ctx: ServerContext, job: Package): Promise<void> {
  const artifactId = newId('art');
  const key = `sessions/${job.sessionId}/artifacts/${artifactId}.zip`;
  const temp = await ctx.storage.createTempPath();
  const heartbeat = setInterval(() => {
    ctx.db
      .prepare('UPDATE jobs SET package_lease=? WHERE id=? AND package_token=?')
      .run(Date.now() + LEASE_MS, job.id, job.token);
  }, LEASE_MS / 3);
  try {
    const files = ctx.db
      .prepare("SELECT filename,output_key FROM job_items WHERE job_id=? AND status='done' ORDER BY seq")
      .all(job.id) as { filename: string; output_key: string }[];
    const zip = new ZipFile();
    const written = pipeline(zip.outputStream, createWriteStream(temp));
    zip.on('error', (error) => (zip.outputStream as Readable).destroy(error));
    for (const file of files)
      zip.addReadStreamLazy(file.filename, { compress: false }, (cb) => cb(null, ctx.storage.read(file.output_key)));
    zip.end();
    await written;
    await ctx.storage.adopt(temp, key);
    const info = await ctx.storage.stat(key);
    if (!info) throw new Error('Missing archive');
    const hash = createHash('sha256');
    for await (const chunk of ctx.storage.read(key)) hash.update(chunk);
    const now = new Date();
    const committed = withTransaction(ctx.db, () => {
      const live = ctx.db
        .prepare("SELECT id FROM jobs WHERE id=? AND status='running' AND package_token=?")
        .get(job.id, job.token);
      if (!live) return false;
      ctx.db
        .prepare(
          `INSERT INTO artifacts(id,job_id,session_id,storage_key,byte_size,file_count,sha256,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          artifactId,
          job.id,
          job.sessionId,
          key,
          info.size,
          files.length,
          hash.digest('hex'),
          now.toISOString(),
          new Date(now.getTime() + ctx.limits.artifactTtlHours * 3600000).toISOString(),
        );
      ctx.db
        .prepare(
          `UPDATE jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM job_items WHERE job_id=? AND status='failed')
        THEN 'completed_with_errors' ELSE 'completed' END,finished_at=?,package_token=NULL,package_lease=NULL WHERE id=?`,
        )
        .run(job.id, now.toISOString(), job.id);
      return true;
    });
    if (!committed) await ctx.storage.delete(key);
  } catch {
    await ctx.storage.delete(key).catch(() => undefined);
    ctx.db
      .prepare(
        `UPDATE jobs SET status='failed',finished_at=?,error_message=?,package_token=NULL,package_lease=NULL
      WHERE id=? AND status='running' AND package_token=?`,
      )
      .run(new Date().toISOString(), 'Could not prepare the ZIP download. Retry the export.', job.id, job.token);
  } finally {
    clearInterval(heartbeat);
    await rm(temp, { force: true });
  }
}

/** Bounded maintenance, run by the dedicated worker even when no new visitors arrive. */
export async function sweepExports(ctx: ServerContext, now = new Date()): Promise<void> {
  const expired = ctx.db
    .prepare('SELECT id,storage_key FROM artifacts WHERE expires_at<=? LIMIT 50')
    .all(now.toISOString()) as { id: string; storage_key: string }[];
  for (const item of expired) {
    await ctx.storage.delete(item.storage_key);
    ctx.db.prepare('DELETE FROM artifacts WHERE id=?').run(item.id);
  }
  const cutoff = new Date(now.getTime() - ctx.limits.artifactTtlHours * 3600000).toISOString();
  const old = ctx.db.prepare('SELECT id,session_id FROM jobs WHERE finished_at<? LIMIT 50').all(cutoff) as {
    id: string;
    session_id: string;
  }[];
  for (const job of old) {
    await ctx.storage.deletePrefix(`sessions/${job.session_id}/jobs/${job.id}`);
    ctx.db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);
  }
  await sweepExpiredSessions(ctx, now);
}
