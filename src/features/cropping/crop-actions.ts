import { makeAspect } from '@/lib/cropping/aspect';
import {
  buildCrop,
  changeAspect,
  DEFAULT_FRAMING,
  isFaceMode,
  recropForImage,
  type BuildFailure,
  type RectPatch,
  withRect,
} from '@/lib/cropping/build';
import { isEqualSided, SHAPE_LABELS, shapeAspect } from '@/lib/cropping/shapes';
import { FREE_ASPECT } from '@/lib/cropping/aspect';
import { useDetectionStore } from '@/stores/detection-store';
import { selectCrop, useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type {
  AspectRatio,
  CropMode,
  CropRegion,
  CropShape,
  FaceId,
  FramingParams,
  ImageId,
  Size,
} from '@/types/domain';

/**
 * Crop operations (SKILLS.md §E-6, §E-8): thin glue between the pure crop logic in `lib/cropping` and the stores. Every
 * change goes through the edit store, so it is undoable, saved, and marks the image dirty like any other edit.
 */

const MODE_LABEL: Record<CropMode, string> = { portrait: 'Portrait', face: 'Face-only', custom: 'Custom' };

function imageSize(id: ImageId): Size | null {
  const image = useLibraryStore.getState().images[id];
  return image ? { width: image.width, height: image.height } : null;
}

/** The faces detected in an image: `null` when detection has not produced a result for it. */
function facesOf(id: ImageId) {
  const result = useDetectionStore.getState().results[id];
  return result ? result.faces : null;
}

const currentCrop = (id: ImageId): CropRegion | null => selectCrop(id)(useEditStore.getState());

export type CropOutcome = { ok: true } | BuildFailure | { ok: false; reason: 'no_image' | 'no_crop' };

/** Choose a crop mode. Custom keeps an existing box; face modes (re)frame from the detected face. */
export function chooseMode(id: ImageId, mode: CropMode): CropOutcome {
  const image = imageSize(id);
  if (!image) return { ok: false, reason: 'no_image' };
  const previous = currentCrop(id);
  const result = buildCrop({
    image,
    mode,
    aspect: previous?.aspect ?? (mode === 'custom' ? FREE_ASPECT : makeAspect('4:5')),
    framing: previous?.framing ?? DEFAULT_FRAMING,
    faces: facesOf(id),
    faceId: previous?.faceId ?? null,
    previous,
  });
  if (!result.ok) return result;
  useEditStore.getState().setCrop(id, result.crop, `${MODE_LABEL[mode]} crop`);
  return { ok: true };
}

/** Change the aspect ratio. With no crop yet, this starts a custom box at that ratio. */
export function chooseAspect(id: ImageId, aspect: AspectRatio): CropOutcome {
  const image = imageSize(id);
  if (!image) return { ok: false, reason: 'no_image' };
  const previous = currentCrop(id);
  if (!previous) {
    const created = buildCrop({
      image,
      mode: 'custom',
      aspect,
      framing: DEFAULT_FRAMING,
      faces: null,
      faceId: null,
      previous: null,
    });
    if (!created.ok) return created;
    useEditStore.getState().setCrop(id, created.crop, 'Aspect ratio');
    return { ok: true };
  }
  useEditStore.getState().setCrop(id, changeAspect(previous, aspect, image, facesOf(id)), 'Aspect ratio');
  return { ok: true };
}

/** Shape changes share the same saved, undoable edit as the crop frame. */
export function chooseShape(id: ImageId, shape: CropShape): CropOutcome {
  const image = imageSize(id);
  if (!image) return { ok: false, reason: 'no_image' };
  const previous = currentCrop(id);
  const baseAspect = previous
    ? isEqualSided(previous.shape) && !isEqualSided(shape)
      ? FREE_ASPECT
      : previous.aspect
    : shape === 'hexagon'
      ? makeAspect('custom', 2 / Math.sqrt(3))
      : FREE_ASPECT;
  if (previous) {
    // Reframe when face results are available; otherwise retain the saved position.
    const crop = changeAspect({ ...previous, shape }, shapeAspect(shape, baseAspect), image, facesOf(id));
    useEditStore.getState().setCrop(id, crop, `${SHAPE_LABELS[shape]} crop`);
  } else {
    const result = buildCrop({
      image,
      shape,
      mode: 'custom',
      aspect: shapeAspect(shape, baseAspect),
      framing: DEFAULT_FRAMING,
      faces: null,
      faceId: null,
      previous: null,
    });
    if (!result.ok) return result;
    useEditStore.getState().setCrop(id, result.crop, `${SHAPE_LABELS[shape]} crop`);
  }
  return { ok: true };
}

/** Frame a different face (face modes). */
export function chooseFace(id: ImageId, faceId: FaceId): CropOutcome {
  const image = imageSize(id);
  const previous = currentCrop(id);
  if (!image) return { ok: false, reason: 'no_image' };
  if (!previous || !isFaceMode(previous.mode)) return { ok: false, reason: 'no_crop' };
  const result = buildCrop({
    image,
    mode: previous.mode,
    aspect: previous.aspect,
    framing: previous.framing,
    faces: facesOf(id),
    faceId,
    previous,
  });
  if (!result.ok) return result;
  useEditStore.getState().setCrop(id, result.crop, 'Choose face');
  return { ok: true };
}

/**
 * Live framing change from a slider (face modes). Re-derives the box from the face, so a hand-adjusted box is replaced:
 * the parameters are the definition of an automatic crop. Pair with `commitGesture` when the slider is released.
 */
export function setFramingLive(id: ImageId, patch: Partial<FramingParams>): CropOutcome {
  const image = imageSize(id);
  const previous = currentCrop(id);
  if (!image) return { ok: false, reason: 'no_image' };
  if (!previous || !isFaceMode(previous.mode)) return { ok: false, reason: 'no_crop' };
  const result = buildCrop({
    image,
    mode: previous.mode,
    aspect: previous.aspect,
    framing: { ...previous.framing, ...patch },
    faces: facesOf(id),
    faceId: previous.faceId,
    previous,
  });
  if (!result.ok) return result;
  useEditStore.getState().setCropLive(id, result.crop);
  return { ok: true };
}

/** Typed X / Y / width / height. One undoable step per entry. */
export function typeRect(id: ImageId, patch: RectPatch): CropOutcome {
  const image = imageSize(id);
  const previous = currentCrop(id);
  if (!image) return { ok: false, reason: 'no_image' };
  if (!previous) return { ok: false, reason: 'no_crop' };
  useEditStore.getState().setCrop(id, withRect(previous, patch, image), 'Edit crop');
  return { ok: true };
}

export function removeCrop(id: ImageId): void {
  if (currentCrop(id)) useEditStore.getState().setCrop(id, null, 'Remove crop');
}

/** Preserve crop dimensions and aspect; move its center to the image center as one undoable step. */
export function centerCrop(id: ImageId): void {
  const image = imageSize(id);
  const crop = currentCrop(id);
  if (!image || !crop) return;
  useEditStore.getState().setCrop(
    id,
    {
      ...crop,
      rect: {
        ...crop.rect,
        x: Math.round((image.width - crop.rect.width) / 2),
        y: Math.round((image.height - crop.rect.height) / 2),
      },
      manual: true,
      constrained: false,
    },
    'Center crop',
  );
}

export type BatchCropResult = {
  applied: number;
  skippedNoFace: number;
  skippedNotDetected: number;
};

/**
 * Copy the crop SETTINGS of `sourceId` to other images as ONE undoable step. Face modes are re-framed from each image's own
 * detected face; custom crops map by normalized position and size. Images a face mode cannot frame (no face found, or detection
 * has not reached them yet) are skipped, never given a copied rectangle that would be wrong for them.
 */
export function applyCropTo(sourceId: ImageId, targetIds: readonly ImageId[], label: string): BatchCropResult {
  const source = currentCrop(sourceId);
  const sourceImage = imageSize(sourceId);
  const result: BatchCropResult = { applied: 0, skippedNoFace: 0, skippedNotDetected: 0 };
  if (!source || !sourceImage) return result;

  const entries: { id: ImageId; crop: CropRegion }[] = [];
  for (const id of new Set(targetIds)) {
    if (id === sourceId) continue;
    const target = imageSize(id);
    if (!target) continue;
    const built = recropForImage(source, sourceImage, target, facesOf(id));
    if (built.ok) entries.push({ id, crop: built.crop });
    else if (built.reason === 'no_face') result.skippedNoFace += 1;
    else result.skippedNotDetected += 1;
  }
  if (entries.length > 0) useEditStore.getState().applyCrops(entries, label);
  result.applied = entries.length;
  return result;
}
