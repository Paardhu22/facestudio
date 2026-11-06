import { Readable } from 'node:stream';

import { IMAGE_ID_PATTERN } from '@/lib/api/schemas';
import { getContext } from '@server/context';
import { AppError } from '@server/errors';
import { getSession, withErrors } from '@server/http';
import { getImage, renditionKey } from '@server/images/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; rendition: string }> };

/**
 * Serve a thumbnail or preview, only to the session that owns it. A missing, foreign, or malformed id
 * always yields the same 404, so ids cannot be probed. Renditions are immutable, hence the long cache.
 */
export const GET = withErrors(async (_request: Request, { params }: Params) => {
  const { id, rendition } = await params;
  if ((rendition !== 'thumb' && rendition !== 'preview') || !IMAGE_ID_PATTERN.test(id)) {
    throw new AppError('not_found', 'Image not found.');
  }

  const ctx = getContext();
  const session = await getSession(ctx);
  const image = session ? getImage(ctx, session.sessionId, id) : null;
  if (!session || !image) throw new AppError('not_found', 'Image not found.');

  const key = renditionKey(session.sessionId, image.id, rendition);
  const info = await ctx.storage.stat(key);
  if (!info) throw new AppError('not_found', 'Image not found.');

  return new Response(Readable.toWeb(ctx.storage.read(key)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(info.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});
