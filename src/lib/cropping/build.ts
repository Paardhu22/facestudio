import type {
  AspectRatio,
  CropMode,
  CropShape,
  CropRegion,
  DetectedFace,
  FaceId,
  FramingParams,
  Rect,
  Size,
} from '@/types/domain';

import { centeredRectWithAspect, clamp, clampRect, commitRect, rectCenter } from '../coordinates/rect';
import { DEFAULT_ASPECT, resolveAspect } from './aspect';
import { isEqualSided, shapeAspect } from './shapes';
import { defaultCustomRect, mapCustomCrop } from './custom';
import { DEFAULT_FRAMING, faceOnlyCrop, MIN_CROP_SIDE, newCropId, pickFace, portraitCrop } from './framing';

/**
 * Turning the user's choices into a crop (SKILLS.md §E-6, §E-8). Pure functions: the UI and the batch operations both call
 * these, so a crop made by hand, by a mode change, or by "apply to all" follows exactly the same rules.
 *
 * Coordinates are integers in oriented original pixels (ADR-007).
 */

export type FaceInfo = readonly DetectedFace[] | null; // `null` = detection has not run for this image yet

export type BuildInput = {
  shape?: CropShape;
  image: Size;
  mode: CropMode;
  aspect: AspectRatio;
  framing: FramingParams;
  faces: FaceInfo;
  /** The face to frame (face modes). Falls back to the largest face. */
  faceId: FaceId | null;
  /** The existing crop, whose id (and, for custom crops, rectangle) is kept when it still makes sense. */
  previous: CropRegion | null;
};

export type BuildFailure = { ok: false; reason: 'not_detected' | 'no_face' };
export type BuildResult = { ok: true; crop: CropRegion } | BuildFailure;

const FACE_MODES: readonly CropMode[] = ['portrait', 'face'];
export const isFaceMode = (mode: CropMode): boolean => FACE_MODES.includes(mode);

/** Portrait framing needs a fixed ratio; "free" is not meaningful for a headshot, so it falls back to the default 4:5. */
export const effectiveAspect = (mode: CropMode, aspect: AspectRatio): AspectRatio =>
  mode === 'portrait' && aspect.preset === 'free' ? DEFAULT_ASPECT : aspect;

/** The largest rectangle with `aspect` inside `rect`, centered on it. Used when the ratio of an existing box changes. */
export function refitToAspect(rect: Rect, aspect: number | null, image: Size): Rect {
  if (aspect === null) return clampRect(rect, image);
  const inside = centeredRectWithAspect({ width: rect.width, height: rect.height }, aspect, 1);
  const center = rectCenter(rect);
  const fitted = clampRect(
    { x: center.x - inside.width / 2, y: center.y - inside.height / 2, width: inside.width, height: inside.height },
    image,
  );
  return commitRect(fitted, image, { aspect, minSide: MIN_CROP_SIDE });
}

export function buildCrop(input: BuildInput): BuildResult {
  const { image, mode, framing, faces, faceId, previous } = input;
  const shape = input.shape ?? previous?.shape ?? 'rectangle';
  const aspect = shapeAspect(shape, effectiveAspect(mode, input.aspect));
  const ratio = resolveAspect(aspect, image);
  const id = previous?.id ?? newCropId();

  if (mode === 'custom') {
    const rect = previous ? refitToAspect(previous.rect, ratio, image) : defaultCustomRect(image, ratio);
    return {
      ok: true,
      crop: {
        id,
        mode,
        shape,
        rect,
        aspect,
        faceId: null,
        framing,
        manual: true,
        constrained: false,
        label: previous?.label ?? null,
      },
    };
  }

  if (faces === null) return { ok: false, reason: 'not_detected' };
  const face = pickFace(faces, faceId);
  if (!face) return { ok: false, reason: 'no_face' };

  const framed =
    mode === 'portrait' ? portraitCrop(face, image, ratio ?? 0.8, framing) : faceOnlyCrop(face, image, ratio, framing);
  return {
    ok: true,
    crop: {
      id,
      mode,
      shape,
      rect: framed.rect,
      aspect,
      faceId: face.id,
      framing,
      manual: false,
      constrained: framed.constrained,
      label: previous?.label ?? null,
    },
  };
}

/**
 * Change the aspect ratio of an existing crop. Automatic face crops are re-framed (their rectangle is derived, not
 * authored); custom and hand-adjusted crops keep their center and shrink or reshape to the new ratio inside their own box.
 */
export function changeAspect(previous: CropRegion, aspect: AspectRatio, image: Size, faces: FaceInfo): CropRegion {
  const next = shapeAspect(previous.shape, effectiveAspect(previous.mode, aspect));
  if (isFaceMode(previous.mode) && !previous.manual) {
    const rebuilt = buildCrop({
      image,
      mode: previous.mode,
      aspect: next,
      framing: previous.framing,
      faces,
      faceId: previous.faceId,
      previous,
    });
    if (rebuilt.ok) return rebuilt.crop;
  }
  return {
    ...previous,
    aspect: next,
    rect: refitToAspect(previous.rect, resolveAspect(next, image), image),
    constrained: false,
  };
}

export type RectPatch = Partial<Rect>;

/**
 * Apply typed X / Y / width / height values. Position only moves the box (clamped inside the image). With a fixed ratio, a
 * new width sets the height and a new height sets the width; the size never leaves the image or drops below the minimum.
 * The result is always a valid integer rectangle, and the crop becomes "manual" (the user has taken over).
 */
export function withRect(previous: CropRegion, patch: RectPatch, image: Size): CropRegion {
  const ratio = resolveAspect(shapeAspect(previous.shape, previous.aspect), image);
  const finite = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : undefined);
  const x = finite(patch.x);
  const y = finite(patch.y);
  const width = finite(patch.width);
  const height = finite(patch.height);

  let rect = previous.rect;
  if (width !== undefined || height !== undefined) {
    let w = width ?? rect.width;
    let h = height ?? rect.height;
    if (ratio !== null) {
      // With a fixed ratio the side the user just typed wins, and the other follows.
      if (width !== undefined) {
        h = w / ratio;
      } else {
        h = height ?? rect.height;
        w = h * ratio;
      }
    }
    w = clamp(w, Math.min(MIN_CROP_SIDE, image.width), image.width);
    h = clamp(h, Math.min(MIN_CROP_SIDE, image.height), image.height);
    if (ratio !== null) {
      // Keep the ratio while respecting both image sides.
      const fit = Math.min(1, image.width / w, image.height / h);
      w *= fit;
      h *= fit;
    }
    rect = { x: x ?? rect.x, y: y ?? rect.y, width: w, height: h };
  } else {
    rect = { ...rect, x: x ?? rect.x, y: y ?? rect.y };
  }

  return {
    ...previous,
    rect: commitRect(clampRect(rect, image), image, { aspect: ratio, minSide: MIN_CROP_SIDE }),
    manual: true,
    constrained: false,
  };
}

/**
 * The crop for ANOTHER image when applying settings to many (SKILLS.md §E-8). Face modes are RE-FRAMED from that image's own
 * detected face (identical rectangles would be wrong: faces are in different places); custom crops are carried over by
 * normalized position and size. Returns a failure (and the caller skips the image) when a face mode has no face to frame.
 */
export function recropForImage(
  source: CropRegion,
  sourceImage: Size,
  targetImage: Size,
  targetFaces: FaceInfo,
): BuildResult {
  if (source.mode === 'custom') {
    const ratio = resolveAspect(shapeAspect(source.shape, source.aspect), targetImage);
    const rect = mapCustomCrop(source.rect, sourceImage, targetImage, ratio);
    return { ok: true, crop: { ...source, id: newCropId(), rect, faceId: null, manual: true, constrained: false } };
  }
  return buildCrop({
    image: targetImage,
    mode: source.mode,
    shape: source.shape,
    aspect: source.aspect,
    framing: source.framing,
    faces: targetFaces,
    faceId: null, // each image's own largest face
    previous: null,
  });
}

export { DEFAULT_FRAMING };

/** Server boundary normalization also protects square/circle constraints from stale or authored API requests. */
export function normalizeCropShape(crop: CropRegion, image: Size): CropRegion {
  const aspect = shapeAspect(crop.shape, crop.aspect);
  const rect = isEqualSided(crop.shape)
    ? refitToAspect(crop.rect, 1, image)
    : commitRect(clampRect(crop.rect, image), image, { aspect: null, minSide: MIN_CROP_SIDE });
  return { ...crop, aspect, rect };
}
