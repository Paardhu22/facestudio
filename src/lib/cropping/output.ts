import type { FitStrategy, OutputFormat, OutputSettings, ResizeSpec, Size } from '@/types/domain';

/**
 * Output sizing (SKILLS.md §E-9). Cropping, resizing, padding, and stretching are different operations and are never
 * mixed silently: the fit strategy says what happens when the crop's aspect ratio differs from an exact target size.
 */

export const DEFAULT_OUTPUT: OutputSettings = {
  format: 'source',
  quality: 90,
  resize: { mode: 'none' },
  allowUpscale: false,
  padColor: '#FFFFFF',
  filenameTemplate: '{name}',
};

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['source', 'jpeg', 'png', 'webp'];
export const FIT_STRATEGIES: readonly FitStrategy[] = ['inside', 'cover', 'pad', 'stretch'];

export const FIT_LABELS: Record<FitStrategy, string> = {
  inside: 'Fit inside',
  cover: 'Fill (trim)',
  pad: 'Pad',
  stretch: 'Stretch',
};
export const FIT_HELP: Record<FitStrategy, string> = {
  inside: 'Scales the crop to fit within the size. No distortion; the result may be smaller than the box.',
  cover: 'Fills the exact size and trims the overflow from the center. No distortion; some of the crop is cut off.',
  pad: 'Places the whole crop inside the exact size and fills the rest with the pad color. No distortion.',
  stretch: 'Forces the crop to the exact size. This DISTORTS the image (and any faces in it).',
};

export const MIN_OUTPUT_SIDE = 1;

export type OutputSize = {
  width: number;
  height: number;
  /** Scale applied to the crop's pixels (1 = unchanged; above 1 enlarges). */
  scale: number;
  /** True when pixels were enlarged beyond the crop's own resolution. */
  upscaled: boolean;
  /** True when `stretch` changed the proportions. */
  distorted: boolean;
  /** True when the size was reduced to stay within the maximum output side. */
  limited: boolean;
};

const clampSide = (value: number, max: number) => Math.min(max, Math.max(MIN_OUTPUT_SIDE, Math.round(value)));

/**
 * The size of the exported image for a crop of `crop` pixels. Without `allowUpscale`, a target larger than the crop never
 * enlarges pixels: `inside`, `width`, `height`, and `longEdge` stop at the crop's own size; `cover` shrinks its target box;
 * `pad` keeps the exact canvas but places the crop at its own size; `stretch` is always the exact size (it is explicit).
 */
export function computeOutputSize(
  crop: Size,
  output: Pick<OutputSettings, 'resize' | 'allowUpscale'>,
  maxSide: number,
): OutputSize {
  const { width: cw, height: ch } = crop;
  const resize: ResizeSpec = output.resize;
  let width = cw;
  let height = ch;
  let scale = 1;
  let distorted = false;

  const uniform = (s: number): void => {
    const effective = output.allowUpscale ? s : Math.min(1, s);
    scale = effective;
    width = cw * effective;
    height = ch * effective;
  };

  switch (resize.mode) {
    case 'none':
      break;
    case 'longEdge':
      uniform(resize.size / Math.max(cw, ch));
      break;
    case 'width':
      uniform(resize.width / cw);
      break;
    case 'height':
      uniform(resize.height / ch);
      break;
    case 'exact': {
      const sx = resize.width / cw;
      const sy = resize.height / ch;
      switch (resize.fit) {
        case 'inside':
          uniform(Math.min(sx, sy));
          break;
        case 'cover': {
          const needed = Math.max(sx, sy);
          const shrinkBox = output.allowUpscale || needed <= 1 ? 1 : 1 / needed;
          width = resize.width * shrinkBox;
          height = resize.height * shrinkBox;
          scale = Math.min(output.allowUpscale ? needed : 1, needed);
          break;
        }
        case 'pad': {
          const fit = Math.min(sx, sy);
          scale = output.allowUpscale ? fit : Math.min(1, fit);
          width = resize.width;
          height = resize.height;
          break;
        }
        case 'stretch':
          width = resize.width;
          height = resize.height;
          scale = Math.max(sx, sy);
          distorted = Math.abs(sx - sy) > 1e-9;
          break;
      }
      break;
    }
  }

  const limitedW = Math.min(1, maxSide / Math.max(1, width));
  const limitedH = Math.min(1, maxSide / Math.max(1, height));
  const limit = Math.min(limitedW, limitedH);
  const limited = limit < 1;
  if (limited) {
    width *= limit;
    height *= limit;
    scale *= limit;
  }

  return {
    width: clampSide(width, maxSide),
    height: clampSide(height, maxSide),
    scale,
    upscaled: scale > 1 + 1e-9,
    distorted,
    limited,
  };
}

/** Clamp and sanitize output settings that came from the UI or the network. */
export function normalizeOutput(input: OutputSettings, maxSide: number): OutputSettings {
  const side = (value: number) =>
    Math.min(maxSide, Math.max(MIN_OUTPUT_SIDE, Math.round(Number.isFinite(value) ? value : MIN_OUTPUT_SIDE)));
  let resize: ResizeSpec = input.resize;
  switch (resize.mode) {
    case 'exact':
      resize = { mode: 'exact', width: side(resize.width), height: side(resize.height), fit: resize.fit };
      break;
    case 'longEdge':
      resize = { mode: 'longEdge', size: side(resize.size) };
      break;
    case 'width':
      resize = { mode: 'width', width: side(resize.width) };
      break;
    case 'height':
      resize = { mode: 'height', height: side(resize.height) };
      break;
    case 'none':
      break;
  }
  return {
    ...input,
    quality: Math.min(100, Math.max(1, Math.round(Number.isFinite(input.quality) ? input.quality : 90))),
    resize,
    padColor: /^#[0-9a-fA-F]{6}$/.test(input.padColor) ? input.padColor.toUpperCase() : '#FFFFFF',
  };
}

export const isDefaultOutput = (output: OutputSettings): boolean =>
  output.format === DEFAULT_OUTPUT.format &&
  output.quality === DEFAULT_OUTPUT.quality &&
  output.resize.mode === 'none' &&
  output.allowUpscale === DEFAULT_OUTPUT.allowUpscale &&
  output.padColor === DEFAULT_OUTPUT.padColor &&
  output.filenameTemplate === DEFAULT_OUTPUT.filenameTemplate;
