import type { DetectedFace, FaceKeypointName, Size } from '@/types/domain';

/** What the detection worker reports: boxes in the INPUT (thumbnail) pixels, keypoints normalized to 0..1. */
export type RawFace = {
  box: { x: number; y: number; width: number; height: number };
  score: number;
  keypoints: { x: number; y: number }[];
};

/** BlazeFace keypoint order, as documented by MediaPipe. */
const KEYPOINT_ORDER: readonly FaceKeypointName[] = [
  'rightEye',
  'leftEye',
  'noseTip',
  'mouth',
  'rightEarTragion',
  'leftEarTragion',
];

const finite = (n: number): boolean => Number.isFinite(n);

/**
 * Convert the worker's faces (thumbnail pixels) into `DetectedFace`s in ORIENTED ORIGINAL pixels (ADR-007, ADR-009).
 * The thumbnail is a uniform downscale of the oriented image, so each axis maps by its own ratio. Faces are sorted by
 * confidence and given stable ids `f0, f1, …`; geometry is clamped to the image and malformed entries are dropped.
 */
export function toDetectedFaces(raw: readonly RawFace[], input: Size, image: Size, maxFaces = 64): DetectedFace[] {
  const sx = image.width / input.width;
  const sy = image.height / input.height;

  const faces: Omit<DetectedFace, 'id'>[] = [];
  for (const face of raw) {
    const { x, y, width, height } = face.box;
    if (![x, y, width, height, face.score].every(finite) || width <= 0 || height <= 0) continue;

    const left = Math.min(Math.max(x * sx, 0), image.width - 1);
    const top = Math.min(Math.max(y * sy, 0), image.height - 1);
    const right = Math.min(Math.max((x + width) * sx, left + 1), image.width);
    const bottom = Math.min(Math.max((y + height) * sy, top + 1), image.height);

    const keypoints: DetectedFace['keypoints'] = {};
    face.keypoints.forEach((point, index) => {
      const name = KEYPOINT_ORDER[index];
      if (name && finite(point.x) && finite(point.y)) {
        keypoints[name] = {
          x: Math.min(Math.max(point.x * image.width, 0), image.width),
          y: Math.min(Math.max(point.y * image.height, 0), image.height),
        };
      }
    });

    faces.push({
      box: { x: left, y: top, width: right - left, height: bottom - top },
      score: Math.min(1, Math.max(0, face.score)),
      keypoints,
    });
  }

  faces.sort((a, b) => b.score - a.score);
  return faces.slice(0, maxFaces).map((face, index) => ({ ...face, id: `f${index}` }));
}
