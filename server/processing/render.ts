import 'server-only';

import { rm } from 'node:fs/promises';
import { buffer } from 'node:stream/consumers';
import sharp from 'sharp';

import { computeOutputSize, DEFAULT_OUTPUT } from '@/lib/cropping/output';
import { cropMaskSvg, resizedShapeRect } from '@/lib/cropping/shapes';
import { exportFormat } from '@/lib/export/filenames';
import { applyAdjustments } from '@/lib/image-processing/adjust-kernel';
import type { ImageEdit, SourceImage } from '@/types/domain';

import type { ServerConfig } from '../config';
import { originalKey } from '../images/repository';
import { createLocalStorage } from '../storage/local-driver';

/** Same pixel kernel as the preview, with full-resolution crop/resize before adjustments and padding after them. */
export async function renderImage(
  config: ServerConfig,
  sessionId: string,
  image: SourceImage,
  edit: ImageEdit,
  outputKey: string,
): Promise<{ width: number; height: number; bytes: number }> {
  const storage = createLocalStorage(config.storageDir);
  const original = await buffer(storage.read(originalKey(sessionId, image.id)));
  const output = edit.output ?? DEFAULT_OUTPUT;
  const crop = edit.crop?.rect ?? { x: 0, y: 0, width: image.width, height: image.height };
  const target = computeOutputSize(crop, output, config.limits.maxOutputSide);
  if (target.width * target.height > config.limits.maxImagePixels) throw new Error('Output pixel limit exceeded');
  let pipeline = sharp(original, {
    limitInputPixels: config.limits.maxImagePixels,
    failOn: 'error',
    sequentialRead: true,
  })
    .rotate()
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .toColourspace('srgb')
    .ensureAlpha();
  const resize = output.resize;
  const pad = resize.mode === 'exact' && resize.fit === 'pad';
  if (resize.mode !== 'none' || target.limited) {
    const fit =
      resize.mode === 'exact' && resize.fit === 'stretch'
        ? 'fill'
        : resize.mode === 'exact' && resize.fit === 'cover'
          ? 'cover'
          : 'inside';
    pipeline = pipeline.resize({
      width: target.width,
      height: target.height,
      fit,
      withoutEnlargement: fit === 'fill' ? false : !output.allowUpscale,
    });
  }
  const raw = await pipeline.raw().toBuffer({ resolveWithObject: true });
  applyAdjustments(raw.data, 4, edit.adjustments);
  let encoded = sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } });
  const shape = edit.crop?.shape;
  if (shape === 'circle' || shape === 'hexagon') {
    const size = { width: raw.info.width, height: raw.info.height };
    const bounds = resizedShapeRect(crop, size, resize.mode === 'exact' && resize.fit === 'cover');
    // Materialize the mask before padding: Sharp composites after extend/resize regardless of call order.
    const masked = await encoded
      .composite([{ input: Buffer.from(cropMaskSvg(size, bounds, shape)), blend: 'dest-in' }])
      .raw()
      .toBuffer();
    encoded = sharp(masked, { raw: { ...size, channels: 4 } });
  }
  if (pad) {
    const dx = target.width - raw.info.width;
    const dy = target.height - raw.info.height;
    encoded = encoded.extend({
      left: Math.floor(dx / 2),
      right: Math.ceil(dx / 2),
      top: Math.floor(dy / 2),
      bottom: Math.ceil(dy / 2),
      background: output.padColor,
    });
  }
  const format = exportFormat(image, output);
  if (format === 'jpeg')
    encoded = encoded.flatten({ background: output.padColor }).jpeg({ quality: output.quality, mozjpeg: true });
  else if (format === 'png') encoded = encoded.png();
  else encoded = encoded.webp({ quality: output.quality });
  const temp = await storage.createTempPath();
  try {
    const result = await encoded.toFile(temp);
    await storage.adopt(temp, outputKey);
    return { width: result.width, height: result.height, bytes: result.size };
  } finally {
    await rm(temp, { force: true });
  }
}
