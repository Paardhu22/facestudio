import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import type { SessionId } from '@/types/domain';

import type { ServerContext } from '../context';

/**
 * Anonymous cookie sessions (SKILLS.md §D.10, ADR-005). The browser holds a random 256-bit token;
 * the database stores only its SHA-256, so a leaked database cannot be replayed as cookies.
 */

export const SESSION_COOKIE = 'fs_session';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export type ResolvedSession = {
  sessionId: SessionId;
  /** Set when a session was just created or its sliding expiry was extended; the route must set the cookie. */
  cookieToken: string | null;
};

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function newId<P extends string>(prefix: P): `${P}_${string}` {
  return `${prefix}_${randomBytes(16).toString('base64url')}`;
}

/** Look up the session for a cookie token. Returns `null` for a missing or unknown token. */
export function findSession(ctx: ServerContext, token: string | undefined, now = new Date()): ResolvedSession | null {
  if (!token || token.length > 128) return null;
  const row = ctx.db.prepare('SELECT id, last_seen_at FROM sessions WHERE token_hash = ?').get(hashToken(token)) as
    { id: string; last_seen_at: string } | undefined;
  if (!row) return null;

  let cookieToken: string | null = null;
  if (now.getTime() - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    ctx.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now.toISOString(), row.id);
    cookieToken = token; // re-issue the cookie so its max-age slides with activity
  }
  return { sessionId: row.id as SessionId, cookieToken };
}

export function createSession(ctx: ServerContext, now = new Date()): ResolvedSession {
  void sweepExpiredSessions(ctx, now).catch(() => undefined); // best-effort, in the background
  const token = randomBytes(32).toString('base64url');
  const sessionId = newId('ses');
  const timestamp = now.toISOString();
  ctx.db
    .prepare('INSERT INTO sessions (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, hashToken(token), timestamp, timestamp);
  return { sessionId, cookieToken: token };
}

export function resolveSession(
  ctx: ServerContext,
  token: string | undefined,
  options: { create: boolean },
  now = new Date(),
): ResolvedSession | null {
  return findSession(ctx, token, now) ?? (options.create ? createSession(ctx, now) : null);
}

/** Delete a session with all its images and files (retention, SKILLS.md §C.9). */
export async function deleteSession(ctx: ServerContext, sessionId: SessionId): Promise<void> {
  await ctx.storage.deletePrefix(`sessions/${sessionId}`);
  ctx.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId); // images cascade
}

/**
 * Remove sessions idle longer than the TTL, with their files. Throttled, and started when a session is
 * created, so no background timer is needed. Resolves to the number of sessions deleted.
 */
export async function sweepExpiredSessions(ctx: ServerContext, now = new Date(), force = false): Promise<number> {
  if (!force && now.getTime() - ctx.state.lastSweepMs < SWEEP_INTERVAL_MS) return 0;
  ctx.state.lastSweepMs = now.getTime();
  const cutoff = new Date(now.getTime() - ctx.limits.sessionTtlHours * 3_600_000).toISOString();
  const expired = ctx.db.prepare('SELECT id FROM sessions WHERE last_seen_at < ?').all(cutoff) as { id: string }[];
  for (const { id } of expired) await deleteSession(ctx, id as SessionId);
  return expired.length;
}
