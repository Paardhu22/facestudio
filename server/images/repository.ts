import 'server-only';

import type { ExifOrientation, ImageId, SessionId, SourceImage, SupportedMimeType } from '@/types/domain';

import type { ServerContext } from '../context';

type ImageRow = {
  seq: number;
  id: string;
  filename: string;
  relative_path: string | null;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  orientation: number;
  has_alpha: number;
  content_hash: string;
  duplicate_of: string | null;
  thumb_width: number;
  thumb_height: number;
  preview_width: number;
  preview_height: number;
  created_at: string;
};

export function rowToImage(row: ImageRow): SourceImage {
  return {
    id: row.id as ImageId,
    originalFilename: row.filename,
    relativePath: row.relative_path,
    mimeType: row.mime_type as SupportedMimeType,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    orientation: row.orientation as ExifOrientation,
    hasAlpha: row.has_alpha === 1,
    contentHash: row.content_hash,
    duplicateOfId: row.duplicate_of as ImageId | null,
    renditions: {
      thumb: { width: row.thumb_width, height: row.thumb_height },
      preview: { width: row.preview_width, height: row.preview_height },
    },
    createdAt: row.created_at,
  };
}

export type NewImage = Omit<SourceImage, 'duplicateOfId' | 'createdAt'>;

export function getUsage(ctx: ServerContext, sessionId: SessionId): { count: number; bytes: number } {
  const row = ctx.db
    .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM images WHERE session_id = ?')
    .get(sessionId) as { count: number; bytes: number };
  return { count: row.count, bytes: row.bytes };
}

export function findDuplicateOf(ctx: ServerContext, sessionId: SessionId, contentHash: string): ImageId | null {
  const row = ctx.db
    .prepare('SELECT id FROM images WHERE session_id = ? AND content_hash = ? ORDER BY seq LIMIT 1')
    .get(sessionId, contentHash) as { id: string } | undefined;
  return (row?.id as ImageId | undefined) ?? null;
}

/** Insert one image. Callers wrap this in a transaction together with their limit re-check. */
export function insertImage(ctx: ServerContext, sessionId: SessionId, image: NewImage, now = new Date()): SourceImage {
  const duplicateOfId = findDuplicateOf(ctx, sessionId, image.contentHash);
  const createdAt = now.toISOString();
  ctx.db
    .prepare(
      `INSERT INTO images (id, session_id, filename, relative_path, mime_type, byte_size, width, height, orientation,
         has_alpha, content_hash, duplicate_of, thumb_width, thumb_height, preview_width, preview_height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      image.id,
      sessionId,
      image.originalFilename,
      image.relativePath,
      image.mimeType,
      image.byteSize,
      image.width,
      image.height,
      image.orientation,
      image.hasAlpha ? 1 : 0,
      image.contentHash,
      duplicateOfId,
      image.renditions.thumb.width,
      image.renditions.thumb.height,
      image.renditions.preview.width,
      image.renditions.preview.height,
      createdAt,
    );
  return { ...image, duplicateOfId, createdAt };
}

export type ImagePage = { images: SourceImage[]; nextCursor: string | null };

export function encodeCursor(seq: number): string {
  return Buffer.from(String(seq)).toString('base64url');
}

/** Returns `null` for a malformed cursor. */
export function decodeCursor(cursor: string): number | null {
  const text = Buffer.from(cursor, 'base64url').toString();
  return /^\d{1,15}$/.test(text) ? Number(text) : null;
}

export function listImages(ctx: ServerContext, sessionId: SessionId, afterSeq: number, limit: number): ImagePage {
  const rows = ctx.db
    .prepare('SELECT * FROM images WHERE session_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .all(sessionId, afterSeq, limit + 1) as unknown as ImageRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    images: page.map(rowToImage),
    nextCursor: rows.length > limit && last ? encodeCursor(last.seq) : null,
  };
}

/** Ownership-checked lookup: a missing or foreign image is indistinguishable (always `null`). */
export function getImage(ctx: ServerContext, sessionId: SessionId, id: string): SourceImage | null {
  const row = ctx.db.prepare('SELECT * FROM images WHERE id = ? AND session_id = ?').get(id, sessionId) as
    ImageRow | undefined;
  return row ? rowToImage(row) : null;
}

export const originalKey = (sessionId: string, imageId: string): string => `sessions/${sessionId}/originals/${imageId}`;
export const renditionKey = (sessionId: string, imageId: string, name: 'thumb' | 'preview'): string =>
  `sessions/${sessionId}/renditions/${imageId}.${name}.webp`;

const DELETE_CHUNK = 400;

/** Delete the caller's images (and files). Foreign or unknown ids are ignored. Returns the ids deleted. */
export async function deleteImages(
  ctx: ServerContext,
  sessionId: SessionId,
  ids: readonly string[],
): Promise<ImageId[]> {
  const deleted: ImageId[] = [];
  for (let start = 0; start < ids.length; start += DELETE_CHUNK) {
    const chunk = ids.slice(start, start + DELETE_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const owned = ctx.db
      .prepare(`SELECT id FROM images WHERE session_id = ? AND id IN (${placeholders})`)
      .all(sessionId, ...chunk) as { id: string }[];
    for (const { id } of owned) {
      await Promise.all([
        ctx.storage.delete(originalKey(sessionId, id)),
        ctx.storage.delete(renditionKey(sessionId, id, 'thumb')),
        ctx.storage.delete(renditionKey(sessionId, id, 'preview')),
      ]);
    }
    const ownedIds = owned.map((row) => row.id);
    if (ownedIds.length === 0) continue;
    const ownedPlaceholders = ownedIds.map(() => '?').join(',');
    ctx.db
      .prepare(`UPDATE images SET duplicate_of = NULL WHERE session_id = ? AND duplicate_of IN (${ownedPlaceholders})`)
      .run(sessionId, ...ownedIds);
    ctx.db
      .prepare(`DELETE FROM images WHERE session_id = ? AND id IN (${ownedPlaceholders})`)
      .run(sessionId, ...ownedIds);
    deleted.push(...(ownedIds as ImageId[]));
  }
  return deleted;
}
