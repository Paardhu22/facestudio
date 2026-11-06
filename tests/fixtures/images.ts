import sharp from 'sharp';

/**
 * Deterministic synthetic fixtures (SKILLS.md §D.9). Pixels are a gradient so renditions are
 * non-trivial; no photographs of real people are used anywhere.
 */

function gradient(width: number, height: number, channels: 3 | 4): Buffer {
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      data[i] = Math.round((x / Math.max(1, width - 1)) * 255);
      data[i + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      data[i + 2] = 128;
      if (channels === 4) data[i + 3] = x < width / 2 ? 255 : 100;
    }
  }
  return data;
}

type Size = { width: number; height: number };

export function makeJpeg(
  { width, height }: Size,
  options: { orientation?: number; quality?: number } = {},
): Promise<Buffer> {
  let image = sharp(gradient(width, height, 3), { raw: { width, height, channels: 3 } });
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  return image.jpeg({ quality: options.quality ?? 85 }).toBuffer();
}

export function makePng({ width, height }: Size, options: { alpha?: boolean } = {}): Promise<Buffer> {
  const channels = options.alpha ? 4 : 3;
  return sharp(gradient(width, height, channels), { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

export function makeWebp({ width, height }: Size): Promise<Buffer> {
  return sharp(gradient(width, height, 3), { raw: { width, height, channels: 3 } })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * A 2-frame animated WebP, built from stacked raw frames. `pageHeight` MUST be inside `raw` (it is a
 * `CreateRaw` option); outside it sharp silently produces a still image. Verified by a fixture test.
 */
export function makeAnimatedWebp({ width, height }: Size): Promise<Buffer> {
  const first = gradient(width, height, 3);
  // Frames must differ: the WebP encoder merges identical consecutive frames into a single still frame.
  const second = Buffer.from(first.map((value) => 255 - value));
  return sharp(Buffer.concat([first, second]), {
    raw: { width, height: height * 2, channels: 3, pageHeight: height },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

export function makeGif({ width, height }: Size): Promise<Buffer> {
  return sharp(gradient(width, height, 3), { raw: { width, height, channels: 3 } })
    .gif()
    .toBuffer();
}

/** A tiny, valid JPEG for volume tests (smallest practical decode cost). */
export function makeTinyJpeg(seed: number): Promise<Buffer> {
  const width = 48;
  const height = 48;
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = (i / 3 + seed) % 256;
    data[i + 1] = (seed * 7) % 256;
    data[i + 2] = (seed * 13) % 256;
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 70 })
    .toBuffer();
}
