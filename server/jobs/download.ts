import 'server-only';

import { Readable } from 'node:stream';

import { parseByteRange } from '@/lib/export/range';
import type { ServerContext } from '../context';
import { AppError } from '../errors';

export async function downloadArtifact(
  ctx: ServerContext,
  sessionId: string,
  id: string,
  request: Request,
): Promise<Response> {
  const row = ctx.db
    .prepare('SELECT storage_key,byte_size,sha256 FROM artifacts WHERE id=? AND session_id=? AND expires_at>?')
    .get(id, sessionId, new Date().toISOString()) as
    { storage_key: string; byte_size: number; sha256: string } | undefined;
  if (!row || !(await ctx.storage.stat(row.storage_key)))
    throw new AppError('not_found', 'This download is unavailable or has expired. Export the images again.');
  const etag = `"${row.sha256}"`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="FaceStudio-${id.slice(4, 12)}.zip"`,
    'Content-Length': String(row.byte_size),
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  const range = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  if (range && (!ifRange || ifRange === etag)) {
    const parsed = parseByteRange(range, row.byte_size);
    if (!parsed)
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Length': '0', 'Content-Range': `bytes */${row.byte_size}` },
      });
    headers['Content-Range'] = `bytes ${parsed.start}-${parsed.end}/${row.byte_size}`;
    headers['Content-Length'] = String(parsed.end - parsed.start + 1);
    return new Response(
      request.method === 'HEAD'
        ? null
        : (Readable.toWeb(ctx.storage.read(row.storage_key, parsed)) as ReadableStream<Uint8Array>),
      { status: 206, headers },
    );
  }
  return new Response(
    request.method === 'HEAD'
      ? null
      : (Readable.toWeb(ctx.storage.read(row.storage_key)) as ReadableStream<Uint8Array>),
    { headers },
  );
}
