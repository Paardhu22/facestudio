import 'server-only';

import { cookies } from 'next/headers';

import type { ServerContext } from './context';
import { AppError, isAppError } from './errors';
import { findSession, resolveSession, SESSION_COOKIE, type ResolvedSession } from './session';

/** Thin HTTP helpers shared by route handlers (SKILLS.md §D.6). Handlers stay adapters; logic lives elsewhere. */

/**
 * CSRF defense for mutating requests: the Origin header must be present and match the Host header.
 * Behind a reverse proxy that rewrites Host, configure the proxy to preserve it.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  let originHost: string | null = null;
  if (origin) {
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
  }
  if (!originHost || !host || originHost !== host) {
    throw new AppError('forbidden', 'Cross-origin requests are not allowed.');
  }
}

export function jsonError(error: unknown): Response {
  if (isAppError(error)) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  // Log the error class and message only: never request bodies, filenames, or paths (SKILLS.md §D.10).
  console.error('[api] unhandled error:', error instanceof Error ? `${error.name}: ${error.message}` : typeof error);
  return Response.json(
    { error: { code: 'internal_error', message: 'Something went wrong on the server.' } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Wrap a handler so thrown `AppError`s become typed JSON error responses. */
export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;

function writeSessionCookie(jar: CookieJar, ctx: ServerContext, token: string): void {
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.secureCookies,
    path: '/',
    maxAge: ctx.limits.sessionTtlHours * 3600,
  });
}

/** The caller's session, or `null` when there is no valid cookie. Never creates a session. */
export async function getSession(ctx: ServerContext): Promise<ResolvedSession | null> {
  const jar = await cookies();
  const session = findSession(ctx, jar.get(SESSION_COOKIE)?.value);
  if (session?.cookieToken) writeSessionCookie(jar, ctx, session.cookieToken);
  return session;
}

/** The caller's session, creating one (and setting the cookie) when none exists. */
export async function getOrCreateSession(ctx: ServerContext): Promise<ResolvedSession> {
  const jar = await cookies();
  const session = resolveSession(ctx, jar.get(SESSION_COOKIE)?.value, { create: true });
  if (!session) throw new AppError('internal_error', 'Could not start a session.');
  if (session.cookieToken) writeSessionCookie(jar, ctx, session.cookieToken);
  return session;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
