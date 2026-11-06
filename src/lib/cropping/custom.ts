import type { Rect, Size } from '@/types/domain';

import { centeredRectWithAspect, clampRect, commitRect } from '../coordinates/rect';
import { MIN_CROP_SIDE } from './framing';

/** Custom bounding boxes (SKILLS.md §E-6, §E-8). */

/** A sensible starting box: centered, covering 80% of the image (at the aspect ratio when one is set). */
export function defaultCustomRect(image: Size, aspect: number | null): Rect {
  const rect =
    aspect === null
      ? { x: image.width * 0.1, y: image.height * 0.1, width: image.width * 0.8, height: image.height * 0.8 }
      : centeredRectWithAspect(image, aspect, 0.8);
  return commitRect(rect, image, { aspect, minSide: MIN_CROP_SIDE });
}

/**
 * Carry a custom crop from one image to another of a different size (SKILLS.md §E-8). The box keeps its NORMALIZED center
 * and its size relative to the image, so "the middle 60%" stays the middle 60%. With an aspect ratio the ratio is kept in
 * pixels (not stretched with the image): the width follows the relative width and the height is derived from the ratio, then
 * both are reduced if the target image cannot hold them.
 */
export function mapCustomCrop(rect: Rect, from: Size, to: Size, aspect: number | null): Rect {
  const cx = (rect.x + rect.width / 2) / from.width;
  const cy = (rect.y + rect.height / 2) / from.height;
  let width = (rect.width / from.width) * to.width;
  let height = (rect.height / from.height) * to.height;

  if (aspect !== null) {
    height = width / aspect;
    const shrink = Math.min(1, to.width / width, to.height / height);
    width *= shrink;
    height *= shrink;
  }

  const placed = clampRect({ x: cx * to.width - width / 2, y: cy * to.height - height / 2, width, height }, to);
  return commitRect(placed, to, { aspect, minSide: MIN_CROP_SIDE });
}
