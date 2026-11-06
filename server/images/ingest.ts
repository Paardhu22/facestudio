import 'server-only';

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform, type TransformCallback, type Readable } from 'node:stream';

import sharp, { type Metadata } from 'sharp';

import type { Limits } from '@/lib/config/limits';
import { MIME_LABELS, SIGNATURE_BYTES, sniffImageType } from '@/lib/validation/image-signature';
import { sanitizeDisplayName, sanitizeRelativePath } from '@/lib/validation/filenames';
import type { ExifOrientation, SessionId, SourceImage, SupportedMimeType } from '@/types/domain';

import type { ServerContext } from '../context';
import { withTransaction } from '../db';
import { AppError } from '../errors';
import { newId } from '../session';
import { getUsage, insertImage, originalKey, renditionKey } from './repository';

/**
 * Ingest pipeline (SKILLS.md §C.3, ADR-001). One uploaded file →
 *   1. stream to a temp file, counting bytes, hashing, and checking the magic bytes WHILE streaming
 *   2. probe with sharp under pixel/side limits (decompression-bomb guard), reject animated inputs
 *   3. decode ONCE, auto-orient, and render the thumb and preview from the same raw buffer
 *   4. store original + renditions, then insert the row inside a transaction that re-checks batch limits
 * Any failure removes everything written so far.
 */

export const THUMB_LONG_EDGE = 384;
export const PREVIEW_LONG_EDGE = 2048;
const THUMB_QUALITY = 78;
const PREVIEW_QUALITY = 88;

const SHARP_FORMAT_FOR_MIME: Record<SupportedMimeType, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

class IngestGuard extends Transform {
  bytes = 0;
  mime: SupportedMimeType | null = null;
  readonly hash = createHash('sha256');
  private head = Buffer.alloc(0);
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    super();
    this.maxBytes = maxBytes;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new AppError('file_too_large', 'This file is larger than the maximum allowed size.'));
      return;
    }
    if (this.mime === null) {
      this.head = Buffer.concat([this.head, chunk.subarray(0, SIGNATURE_BYTES)]).subarray(0, SIGNATURE_BYTES);
      if (this.head.length >= SIGNATURE_BYTES) {
        this.mime = sniffImageType(this.head);
        if (this.mime === null) {
          callback(new AppError('unsupported_type', 'Only JPEG, PNG, and WebP images are supported.'));
          return;
        }
      }
    }
    this.hash.update(chunk);
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback): void {
    if (this.mime === null) {
      callback(new AppError('unsupported_type', 'Only JPEG, PNG, and WebP images are supported.'));
      return;
    }
    callback();
  }
}

type Probe = { width: number; height: number; orientation: ExifOrientation; hasAlpha: boolean };

function toOrientation(value: number | undefined): ExifOrientation {
  return value !== undefined && value >= 1 && value <= 8 ? (value as ExifOrientation) : 1;
}

async function probe(filePath: string, mime: SupportedMimeType, limits: Limits): Promise<Probe> {
  let meta: Metadata;
  try {
    // Header-only parse: it never decodes pixels, so the pixel limit is checked explicitly below for an
    // accurate error. Decoding (renderRenditions) keeps sharp's own limit as a second guard.
    meta = await sharp(filePath, { limitInputPixels: false, failOn: 'error' }).metadata();
  } catch {
    throw new AppError('decode_failed', 'This image could not be read. It may be corrupt.');
  }

  if (meta.format !== SHARP_FORMAT_FOR_MIME[mime]) {
    throw new AppError('unsupported_type', `This file is not a valid ${MIME_LABELS[mime]} image.`);
  }
  if ((meta.pages ?? 1) > 1) {
    throw new AppError('animated_not_supported', 'Animated images are not supported.');
  }

  const { width, height } = meta;
  if (!width || !height) throw new AppError('decode_failed', 'This image could not be read. It may be corrupt.');

  if (width > limits.maxImageSide || height > limits.maxImageSide) {
    throw new AppError('dimensions_exceeded', `Images may be at most ${limits.maxImageSide} pixels on a side.`);
  }
  if (width * height > limits.maxImagePixels) {
    throw new AppError('pixel_limit_exceeded', 'This image has too many pixels to process safely.');
  }

  const orientation = toOrientation(meta.orientation);
  const swapped = orientation >= 5;
  return {
    width: swapped ? height : width,
    height: swapped ? width : height,
    orientation,
    hasAlpha: meta.hasAlpha === true,
  };
}

type Rendered = { data: Buffer; width: number; height: number };

/** Decode once (auto-oriented, sRGB, ≤ preview size) and encode both renditions from the raw pixels. */
async function renderRenditions(filePath: string, limits: Limits): Promise<{ thumb: Rendered; preview: Rendered }> {
  try {
    const { data: raw, info } = await sharp(filePath, {
      limitInputPixels: limits.maxImagePixels,
      failOn: 'error',
      sequentialRead: true,
    })
      .rotate()
      .resize({ width: PREVIEW_LONG_EDGE, height: PREVIEW_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });

    const rawInput = { raw: { width: info.width, height: info.height, channels: info.channels } } as const;
    const [preview, thumb] = await Promise.all([
      sharp(raw, rawInput).webp({ quality: PREVIEW_QUALITY, effort: 3 }).toBuffer({ resolveWithObject: true }),
      sharp(raw, rawInput)
        .resize({ width: THUMB_LONG_EDGE, height: THUMB_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY, effort: 3 })
        .toBuffer({ resolveWithObject: true }),
    ]);
    return {
      preview: { data: preview.data, width: preview.info.width, height: preview.info.height },
      thumb: { data: thumb.data, width: thumb.info.width, height: thumb.info.height },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('decode_failed', 'This image could not be processed. It may be corrupt.');
  }
}

export type IngestInput = {
  sessionId: SessionId;
  body: Readable;
  /** Content-Length from the request, when known (enables early rejection). */
  declaredLength: number | null;
  filename: string;
  relativePath: string | null;
};

function assertBatchCapacity(limits: Limits, usage: { count: number; bytes: number }, addedBytes: number): void {
  if (usage.count >= limits.maxBatchImages) {
    throw new AppError('batch_limit_reached', `A batch can hold at most ${limits.maxBatchImages} images.`);
  }
  if (usage.bytes + addedBytes > limits.maxBatchBytes) {
    throw new AppError('batch_bytes_exceeded', 'This batch has reached its maximum total size.');
  }
}

export async function ingestImage(ctx: ServerContext, input: IngestInput): Promise<SourceImage> {
  const { limits, storage } = ctx;
  const { sessionId } = input;

  assertBatchCapacity(limits, getUsage(ctx, sessionId), input.declaredLength ?? 0);
  if (input.declaredLength !== null && input.declaredLength > limits.maxFileBytes) {
    throw new AppError('file_too_large', 'This file is larger than the maximum allowed size.');
  }

  const imageId = newId('img');
  const tempPath = await storage.createTempPath();
  const writtenKeys: string[] = [];

  try {
    const guard = new IngestGuard(limits.maxFileBytes);
    await pipeline(input.body, guard, createWriteStream(tempPath));
    if (guard.bytes === 0 || guard.mime === null) {
      throw new AppError('unsupported_type', 'Only JPEG, PNG, and WebP images are supported.');
    }
    const mime = guard.mime;
    const contentHash = guard.hash.digest('hex');

    const meta = await probe(tempPath, mime, limits);
    const { thumb, preview } = await renderRenditions(tempPath, limits);

    const thumbKey = renditionKey(sessionId, imageId, 'thumb');
    const previewKey = renditionKey(sessionId, imageId, 'preview');
    const origKey = originalKey(sessionId, imageId);
    writtenKeys.push(thumbKey, previewKey);
    await Promise.all([storage.writeFile(thumbKey, thumb.data), storage.writeFile(previewKey, preview.data)]);
    writtenKeys.push(origKey);
    await storage.adopt(tempPath, origKey);

    // The limit re-check and insert share one synchronous transaction, so concurrent uploads cannot overshoot.
    return withTransaction(ctx.db, () => {
      assertBatchCapacity(limits, getUsage(ctx, sessionId), guard.bytes);
      return insertImage(ctx, sessionId, {
        id: imageId,
        originalFilename: sanitizeDisplayName(input.filename),
        relativePath: input.relativePath === null ? null : sanitizeRelativePath(input.relativePath),
        mimeType: mime,
        byteSize: guard.bytes,
        width: meta.width,
        height: meta.height,
        orientation: meta.orientation,
        hasAlpha: meta.hasAlpha,
        contentHash,
        renditions: {
          thumb: { width: thumb.width, height: thumb.height },
          preview: { width: preview.width, height: preview.height },
        },
      });
    });
  } catch (error) {
    await Promise.allSettled([rm(tempPath, { force: true }), ...writtenKeys.map((key) => storage.delete(key))]);
    throw error;
  }
}
