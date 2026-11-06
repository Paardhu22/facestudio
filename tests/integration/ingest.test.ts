// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveLimits } from '@/lib/config/limits';
import type { SessionId } from '@/types/domain';
import { createContext, type ServerContext } from '@server/context';
import { AppError } from '@server/errors';
import { ingestImage, PREVIEW_LONG_EDGE, THUMB_LONG_EDGE } from '@server/images/ingest';
import { deleteImages, getImage, listImages, renditionKey } from '@server/images/repository';
import { createSession, deleteSession, findSession, sweepExpiredSessions } from '@server/session';

import { makeAnimatedWebp, makeGif, makeJpeg, makePng, makeWebp } from '../fixtures/images';

let dir: string;
let ctx: ServerContext;
let sessionId: SessionId;

async function makeContext(limitEnv: Record<string, string> = {}): Promise<ServerContext> {
  return createContext({ limits: resolveLimits(limitEnv), storageDir: dir, secureCookies: false }, ':memory:');
}

function upload(
  buffer: Buffer,
  options: {
    filename?: string;
    relativePath?: string | null;
    session?: SessionId;
    declaredLength?: number | null;
  } = {},
) {
  return ingestImage(ctx, {
    sessionId: options.session ?? sessionId,
    body: Readable.from([buffer]),
    declaredLength: options.declaredLength === undefined ? buffer.length : options.declaredLength,
    filename: options.filename ?? 'photo.jpg',
    relativePath: options.relativePath ?? null,
  });
}

async function expectRejection(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

async function filesUnder(sub: string): Promise<string[]> {
  try {
    return await readdir(path.join(dir, sub), { recursive: true });
  } catch {
    return [];
  }
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'facestudio-test-'));
  ctx = await makeContext();
  sessionId = createSession(ctx).sessionId;
});

afterEach(async () => {
  ctx.db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('fixtures', () => {
  it('the animated WebP fixture really is animated (guards the rejection test below)', async () => {
    const meta = await sharp(await makeAnimatedWebp({ width: 32, height: 32 })).metadata();
    expect(meta.pages).toBe(2);
    expect(meta.height).toBe(32);
  });
});

describe('ingestImage: accepted inputs', () => {
  it('stores a JPEG with correct metadata, renditions, and on-disk files', async () => {
    const image = await upload(await makeJpeg({ width: 200, height: 100 }), { filename: 'IMG_0001.jpg' });
    expect(image).toMatchObject({
      originalFilename: 'IMG_0001.jpg',
      mimeType: 'image/jpeg',
      width: 200,
      height: 100,
      orientation: 1,
      hasAlpha: false,
      duplicateOfId: null,
    });
    expect(image.id).toMatch(/^img_[A-Za-z0-9_-]{22}$/);
    expect(image.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Small images are never upscaled.
    expect(image.renditions.thumb).toEqual({ width: 200, height: 100 });
    expect(image.renditions.preview).toEqual({ width: 200, height: 100 });

    expect(await ctx.storage.stat(renditionKey(sessionId, image.id, 'thumb'))).not.toBeNull();
    expect(await ctx.storage.stat(`sessions/${sessionId}/originals/${image.id}`)).not.toBeNull();
    expect(getImage(ctx, sessionId, image.id)).toEqual(image);
  });

  it('bounds thumb and preview long edges and preserves aspect ratio on large images', async () => {
    const image = await upload(await makeJpeg({ width: 3000, height: 2000 }));
    expect(image.width).toBe(3000);
    expect(image.renditions.preview).toEqual({
      width: PREVIEW_LONG_EDGE,
      height: Math.round((PREVIEW_LONG_EDGE * 2000) / 3000),
    });
    expect(image.renditions.thumb.width).toBe(THUMB_LONG_EDGE);
    expect(Math.abs(image.renditions.thumb.height - (THUMB_LONG_EDGE * 2000) / 3000)).toBeLessThanOrEqual(1);

    const stored = await sharp(await readRendition(image.id, 'preview')).metadata();
    expect(stored.format).toBe('webp');
    expect(stored.width).toBe(PREVIEW_LONG_EDGE);
  });

  it('records ORIENTED dimensions for EXIF-rotated images and bakes rotation into renditions (ADR-007)', async () => {
    // Stored 120×60 with EXIF orientation 6 (rotate 90°): displays as 60×120.
    const image = await upload(await makeJpeg({ width: 120, height: 60 }, { orientation: 6 }));
    expect(image.orientation).toBe(6);
    expect({ width: image.width, height: image.height }).toEqual({ width: 60, height: 120 });
    expect(image.renditions.thumb).toEqual({ width: 60, height: 120 });
    const thumb = await sharp(await readRendition(image.id, 'thumb')).metadata();
    expect({ width: thumb.width, height: thumb.height }).toEqual({ width: 60, height: 120 });
  });

  it('detects alpha in PNGs and accepts WebP', async () => {
    const png = await upload(await makePng({ width: 40, height: 30 }, { alpha: true }), { filename: 'a.png' });
    expect(png).toMatchObject({ mimeType: 'image/png', hasAlpha: true });
    const webp = await upload(await makeWebp({ width: 40, height: 30 }), { filename: 'b.webp' });
    expect(webp).toMatchObject({ mimeType: 'image/webp', width: 40, height: 30 });
  });

  it('works without a Content-Length header', async () => {
    const image = await upload(await makeJpeg({ width: 30, height: 30 }), { declaredLength: null });
    expect(image.width).toBe(30);
  });

  it('keeps duplicate filenames distinct and flags identical content without rejecting it', async () => {
    const bytes = await makeJpeg({ width: 50, height: 50 });
    const first = await upload(bytes, { filename: 'same.jpg' });
    const second = await upload(bytes, { filename: 'same.jpg' });
    const third = await upload(await makeJpeg({ width: 51, height: 50 }), { filename: 'same.jpg' });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(first.duplicateOfId).toBeNull();
    expect(second.duplicateOfId).toBe(first.id);
    expect(third.duplicateOfId).toBeNull();
  });

  it('sanitizes display names and relative paths; path traversal cannot survive', async () => {
    const image = await upload(await makeJpeg({ width: 20, height: 20 }), {
      filename: '..\\..//evil‮gpj.jpg',
      relativePath: '../../etc/./passwd/../Team A/photo.jpg',
    });
    expect(image.originalFilename).not.toMatch(/[/\\]/);
    expect(image.originalFilename).not.toContain('‮');
    expect(image.relativePath).toBe('etc/passwd/Team A/photo.jpg');
  });
});

describe('ingestImage: rejected inputs leave nothing behind', () => {
  async function expectClean(): Promise<void> {
    expect(await filesUnder('files')).toEqual([]);
    expect(await filesUnder('tmp')).toEqual([]);
    expect(listImages(ctx, sessionId, 0, 10).images).toEqual([]);
  }

  it('rejects a text file named .jpg by its signature', async () => {
    await expectRejection(
      upload(Buffer.from('this is definitely not an image, just text'), { filename: 'fake.jpg' }),
      'unsupported_type',
    );
    await expectClean();
  });

  it('rejects GIF even though sharp could decode it', async () => {
    await expectRejection(upload(await makeGif({ width: 20, height: 20 })), 'unsupported_type');
    await expectClean();
  });

  it.each([0, 5])('rejects bodies shorter than a signature (%i bytes)', async (length) => {
    await expectRejection(upload(Buffer.alloc(length, 0xff), { declaredLength: length }), 'unsupported_type');
    await expectClean();
  });

  it('rejects a JPEG signature on garbage data as undecodable', async () => {
    const bogus = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expectRejection(upload(bogus), 'decode_failed');
    await expectClean();
  });

  it('rejects animated WebP', async () => {
    await expectRejection(upload(await makeAnimatedWebp({ width: 32, height: 32 })), 'animated_not_supported');
    await expectClean();
  });

  it('rejects oversize files by declared length before reading the body', async () => {
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_FILE_BYTES: '1000' });
    sessionId = createSession(ctx).sessionId;
    const bytes = await makeJpeg({ width: 300, height: 300 });
    expect(bytes.length).toBeGreaterThan(1000);
    await expectRejection(upload(bytes), 'file_too_large');
    await expectClean();
  });

  it('enforces the byte limit while streaming even when Content-Length lies', async () => {
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_FILE_BYTES: '1000' });
    sessionId = createSession(ctx).sessionId;
    const bytes = await makeJpeg({ width: 300, height: 300 });
    await expectRejection(upload(bytes, { declaredLength: 10 }), 'file_too_large');
    await expectClean();
  });

  it('rejects images over the pixel limit (decompression-bomb guard)', async () => {
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_IMAGE_PIXELS: '10000' });
    sessionId = createSession(ctx).sessionId;
    await expectRejection(upload(await makeJpeg({ width: 200, height: 200 })), 'pixel_limit_exceeded');
    await expectClean();
  });

  it('rejects images over the per-side limit', async () => {
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_IMAGE_SIDE: '100' });
    sessionId = createSession(ctx).sessionId;
    await expectRejection(upload(await makeJpeg({ width: 150, height: 20 })), 'dimensions_exceeded');
    await expectClean();
  });
});

describe('batch limits', () => {
  it('enforces the image-count limit and keeps earlier images intact', async () => {
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_BATCH_IMAGES: '2' });
    sessionId = createSession(ctx).sessionId;
    await upload(await makeJpeg({ width: 20, height: 20 }));
    await upload(await makeJpeg({ width: 21, height: 20 }));
    await expectRejection(upload(await makeJpeg({ width: 22, height: 20 })), 'batch_limit_reached');
    expect(listImages(ctx, sessionId, 0, 10).images).toHaveLength(2);
    expect(await filesUnder('tmp')).toEqual([]);
  });

  it('enforces the total-bytes limit', async () => {
    const bytes = await makeJpeg({ width: 100, height: 100 });
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_BATCH_BYTES: String(bytes.length + 10) });
    sessionId = createSession(ctx).sessionId;
    await upload(bytes);
    await expectRejection(upload(await makeJpeg({ width: 101, height: 100 })), 'batch_bytes_exceeded');
  });

  it('never overshoots the count limit under concurrent uploads', async () => {
    ctx.db.close();
    ctx = await makeContext({ FS_MAX_BATCH_IMAGES: '3' });
    sessionId = createSession(ctx).sessionId;
    const buffers = await Promise.all([20, 21, 22, 23, 24, 25].map((w) => makeJpeg({ width: w, height: 20 })));
    const results = await Promise.allSettled(buffers.map((buffer) => upload(buffer)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(listImages(ctx, sessionId, 0, 10).images).toHaveLength(3);
    // Rejected uploads must not leave orphaned files: exactly 3 originals and 3 × (thumb + preview).
    expect(await filesUnder(`files/sessions/${sessionId}/originals`)).toHaveLength(3);
    expect(await filesUnder(`files/sessions/${sessionId}/renditions`)).toHaveLength(6);
    expect(await filesUnder('tmp')).toEqual([]);
  });
});

describe('listing, isolation, deletion, retention', () => {
  it('paginates with an opaque cursor in upload order', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await upload(await makeJpeg({ width: 20 + i, height: 20 }))).id);
    const first = listImages(ctx, sessionId, 0, 2);
    expect(first.images.map((i) => i.id)).toEqual(ids.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    const { decodeCursor } = await import('@server/images/repository');
    const second = listImages(ctx, sessionId, decodeCursor(first.nextCursor!)!, 2);
    expect(second.images.map((i) => i.id)).toEqual(ids.slice(2, 4));
    const third = listImages(ctx, sessionId, decodeCursor(second.nextCursor!)!, 2);
    expect(third.images.map((i) => i.id)).toEqual(ids.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it('isolates sessions: another session cannot see or delete an image', async () => {
    const image = await upload(await makeJpeg({ width: 30, height: 30 }));
    const other = createSession(ctx).sessionId;
    expect(getImage(ctx, other, image.id)).toBeNull();
    expect(listImages(ctx, other, 0, 10).images).toEqual([]);
    expect(await deleteImages(ctx, other, [image.id])).toEqual([]);
    expect(getImage(ctx, sessionId, image.id)).not.toBeNull();
    expect(await ctx.storage.stat(renditionKey(sessionId, image.id, 'thumb'))).not.toBeNull();
  });

  it('deletes images with their files and clears duplicate flags that pointed at them', async () => {
    const bytes = await makeJpeg({ width: 30, height: 30 });
    const original = await upload(bytes);
    const copy = await upload(bytes);
    expect(copy.duplicateOfId).toBe(original.id);

    expect(await deleteImages(ctx, sessionId, [original.id])).toEqual([original.id]);
    expect(getImage(ctx, sessionId, original.id)).toBeNull();
    expect(await ctx.storage.stat(renditionKey(sessionId, original.id, 'thumb'))).toBeNull();
    expect(await ctx.storage.stat(`sessions/${sessionId}/originals/${original.id}`)).toBeNull();
    expect(getImage(ctx, sessionId, copy.id)?.duplicateOfId).toBeNull();
  });

  it('deleting a session removes its images and every file', async () => {
    await upload(await makeJpeg({ width: 30, height: 30 }));
    await upload(await makeJpeg({ width: 31, height: 30 }));
    await deleteSession(ctx, sessionId);
    expect(listImages(ctx, sessionId, 0, 10).images).toEqual([]);
    expect(await filesUnder(`files/sessions/${sessionId}`)).toEqual([]);
  });

  it('sweeps sessions idle past the TTL and keeps active ones', async () => {
    await upload(await makeJpeg({ width: 30, height: 30 }));
    const future = new Date(Date.now() + 25 * 3_600_000);
    const active = createSession(ctx, future); // created "now+25h", so it is fresh at that time
    expect(await sweepExpiredSessions(ctx, future, true)).toBe(1);
    expect(listImages(ctx, sessionId, 0, 10).images).toEqual([]);
    expect(findSession(ctx, active.cookieToken ?? undefined, future)).not.toBeNull();
  });

  it('resolves sessions only from the exact token and hashes tokens at rest', async () => {
    const created = createSession(ctx);
    expect(findSession(ctx, created.cookieToken ?? undefined)?.sessionId).toBe(created.sessionId);
    expect(findSession(ctx, 'not-a-token')).toBeNull();
    expect(findSession(ctx, undefined)).toBeNull();
    const rows = ctx.db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(rows.some((row) => row.token_hash === created.cookieToken)).toBe(false);
  });
});

async function readRendition(id: string, name: 'thumb' | 'preview'): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of ctx.storage.read(renditionKey(sessionId, id, name))) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
