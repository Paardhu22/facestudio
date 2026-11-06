import type { CropId, DetectedFace, FramingParams, Point, Rect, Size } from '@/types/domain';

import { clamp, commitRect, rectCenter } from '../coordinates/rect';

/**
 * Face-aware framing (SKILLS.md §E-6). A face detector reports where the FACE is, not the head, hair, or shoulders, so these
 * are configurable proportions around the face box, not segmentation. If there is not enough room in the image the crop is
 * moved, then shrunk, and `constrained` says the framing had to be compromised.
 */

export const DEFAULT_FRAMING: FramingParams = { faceFill: 0.42, headroom: 0.18, padding: 0.25 };

export const FRAMING_LIMITS = {
  faceFill: { min: 0.2, max: 0.8, step: 0.01 },
  headroom: { min: 0, max: 0.45, step: 0.01 },
  padding: { min: 0, max: 1, step: 0.01 },
} as const;

export const MIN_CROP_SIDE = 16;

export type FramedCrop = { rect: Rect; constrained: boolean };

const SHIFT_TOLERANCE_PX = 1;

/** The face to frame: the preferred one when it exists, otherwise the largest. */
export function pickFace(faces: readonly DetectedFace[], preferredId: string | null): DetectedFace | null {
  if (faces.length === 0) return null;
  const preferred = preferredId === null ? undefined : faces.find((face) => face.id === preferredId);
  if (preferred) return preferred;
  return faces.reduce((best, face) =>
    face.box.width * face.box.height > best.box.width * best.box.height ? face : best,
  );
}

/** Horizontal anchor for portrait framing: the midpoint of the eyes when both were detected, else the face box center. */
export function faceAnchorX(face: DetectedFace): number {
  const { rightEye, leftEye } = face.keypoints;
  return rightEye && leftEye ? (rightEye.x + leftEye.x) / 2 : rectCenter(face.box).x;
}

function fitWithin(width: number, height: number, image: Size): { width: number; height: number; shrunk: boolean } {
  const factor = Math.min(1, image.width / width, image.height / height);
  return { width: width * factor, height: height * factor, shrunk: factor < 1 };
}

/**
 * Headshot framing: the crop height is `faceHeight / faceFill`, the width follows the aspect ratio, the face box sits
 * `headroom × cropHeight` below the top, and the crop is centered on the eyes.
 */
export function portraitCrop(
  face: DetectedFace,
  image: Size,
  aspect: number,
  params: Pick<FramingParams, 'faceFill' | 'headroom'>,
): FramedCrop {
  const fit = fitWithin((face.box.height / params.faceFill) * aspect, face.box.height / params.faceFill, image);
  const { width, height } = fit;
  const wantX = faceAnchorX(face) - width / 2;
  const wantY = face.box.y - params.headroom * height;
  const x = clamp(wantX, 0, image.width - width);
  const y = clamp(wantY, 0, image.height - height);
  const shifted = Math.abs(x - wantX) > SHIFT_TOLERANCE_PX || Math.abs(y - wantY) > SHIFT_TOLERANCE_PX;
  return {
    rect: commitRect({ x, y, width, height }, image, { aspect, minSide: MIN_CROP_SIDE }),
    constrained: fit.shrunk || shifted,
  };
}

/**
 * Tight framing: the face box grown by `padding` on every side (a fraction of the face size), widened or heightened to the
 * aspect ratio when one is set, centered on the face.
 */
export function faceOnlyCrop(
  face: DetectedFace,
  image: Size,
  aspect: number | null,
  params: Pick<FramingParams, 'padding'>,
): FramedCrop {
  let width = face.box.width * (1 + 2 * params.padding);
  let height = face.box.height * (1 + 2 * params.padding);
  if (aspect !== null) {
    if (width / height < aspect) width = height * aspect;
    else height = width / aspect;
  }
  const fit = fitWithin(width, height, image);
  const center: Point = rectCenter(face.box);
  const wantX = center.x - fit.width / 2;
  const wantY = center.y - fit.height / 2;
  const x = clamp(wantX, 0, image.width - fit.width);
  const y = clamp(wantY, 0, image.height - fit.height);
  const shifted = Math.abs(x - wantX) > SHIFT_TOLERANCE_PX || Math.abs(y - wantY) > SHIFT_TOLERANCE_PX;
  return {
    rect: commitRect({ x, y, width: fit.width, height: fit.height }, image, { aspect, minSide: MIN_CROP_SIDE }),
    constrained: fit.shrunk || shifted,
  };
}

/** A fresh crop id: `crp_` + 22 URL-safe characters from the platform CSPRNG. */
export function newCropId(): CropId {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `crp_${body}`;
}
