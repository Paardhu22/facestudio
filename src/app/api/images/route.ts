import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import {
  deleteImagesRequestSchema,
  LIST_PAGE_SIZE,
  listQuerySchema,
  UPLOAD_HEADERS,
  type ListResponse,
} from '@/lib/api/schemas';
import { getContext } from '@server/context';
import { AppError } from '@server/errors';
import { assertSameOrigin, getOrCreateSession, getSession, withErrors } from '@server/http';
import { ingestImage } from '@server/images/ingest';
import { decodeCursor, deleteImages, listImages } from '@server/images/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function decodeHeader(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (raw === null) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new AppError('invalid_request', `Malformed ${name} header.`);
  }
}

/** List the caller's images, oldest first, one page at a time. */
export const GET = withErrors(async (request: Request) => {
  const ctx = getContext();
  const query = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new AppError('invalid_request', 'Invalid query parameters.');

  let afterSeq = 0;
  if (query.data.cursor !== undefined) {
    const decoded = decodeCursor(query.data.cursor);
    if (decoded === null) throw new AppError('invalid_request', 'Invalid cursor.');
    afterSeq = decoded;
  }

  const session = await getSession(ctx);
  const page = session
    ? listImages(ctx, session.sessionId, afterSeq, Math.min(query.data.limit, LIST_PAGE_SIZE))
    : { images: [], nextCursor: null };
  const body: ListResponse = { ...page, limits: ctx.limits };
  return Response.json(body, { headers: NO_STORE });
});

/** Upload one image as the raw request body. Names travel in percent-encoded headers. */
export const POST = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = getContext();

  const filename = decodeHeader(request, UPLOAD_HEADERS.filename);
  if (!filename) throw new AppError('invalid_request', `Missing ${UPLOAD_HEADERS.filename} header.`);
  const relativePath = decodeHeader(request, UPLOAD_HEADERS.relativePath);
  if (!request.body) throw new AppError('invalid_request', 'Missing image data.');

  const lengthHeader = request.headers.get('content-length');
  const declaredLength = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;

  const session = await getOrCreateSession(ctx);
  const image = await ingestImage(ctx, {
    sessionId: session.sessionId,
    body: Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>),
    declaredLength,
    filename,
    relativePath,
  });
  return Response.json(image, { status: 201, headers: NO_STORE });
});

/** Delete specific images (and their files) from the caller's batch. */
export const DELETE = withErrors(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = getContext();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError('invalid_request', 'Expected a JSON body.');
  }
  const body = deleteImagesRequestSchema.safeParse(payload);
  if (!body.success) throw new AppError('invalid_request', 'Expected { ids: ImageId[] }.');

  const session = await getSession(ctx);
  const deleted = session ? await deleteImages(ctx, session.sessionId, body.data.ids) : [];
  return Response.json({ deleted }, { headers: NO_STORE });
});
