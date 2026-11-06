import type { CropShape, FaceId, Point, Rect } from '@/types/domain';

import { insideCropShape } from './shapes';
import { rectBottom, rectRight, type ResizeHandle } from '../coordinates/rect';

/**
 * What is under the pointer on the crop canvas (SKILLS.md §B.13, §E-6). Pure and in IMAGE coordinates: the canvas only
 * renders, all interaction decisions live here so they can be tested without a browser. Sizes that must stay constant on
 * screen (handle reach, face label size) are given in screen pixels and converted with the current zoom.
 */

export const HANDLE_REACH_PX = 10; // the 20px target from the design system: 10px each way
export const CHIP_WIDTH_PX = 62;
export const CHIP_HEIGHT_PX = 18;

export type HitTarget =
  { type: 'handle'; handle: ResizeHandle } | { type: 'chip'; faceId: FaceId } | { type: 'move' } | { type: 'none' };

export function handlePoints(rect: Rect): Record<ResizeHandle, Point> {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const r = rectRight(rect);
  const b = rectBottom(rect);
  return {
    nw: { x: rect.x, y: rect.y },
    n: { x: cx, y: rect.y },
    ne: { x: r, y: rect.y },
    e: { x: r, y: cy },
    se: { x: r, y: b },
    s: { x: cx, y: b },
    sw: { x: rect.x, y: b },
    w: { x: rect.x, y: cy },
  };
}

/** The label chip rectangle for a face, in image coordinates (it sits just above the face box). */
export function chipRect(box: Rect, scale: number): Rect {
  return { x: box.x, y: box.y - CHIP_HEIGHT_PX / scale, width: CHIP_WIDTH_PX / scale, height: CHIP_HEIGHT_PX / scale };
}

const inside = (p: Point, r: Rect): boolean => p.x >= r.x && p.x <= rectRight(r) && p.y >= r.y && p.y <= rectBottom(r);
const near = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance;

export function hitTest(
  pointer: Point,
  scale: number,
  crop: Rect | null,
  faces: readonly { id: FaceId; box: Rect }[],
  shape: CropShape = 'rectangle',
): HitTarget {
  const tolerance = HANDLE_REACH_PX / scale;

  if (crop) {
    // Corners first, so they win where an edge zone overlaps them.
    const points = handlePoints(crop);
    for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
      const p = points[handle];
      if (near(pointer.x, p.x, tolerance) && near(pointer.y, p.y, tolerance)) return { type: 'handle', handle };
    }
    const spanX = pointer.x >= crop.x - tolerance && pointer.x <= rectRight(crop) + tolerance;
    const spanY = pointer.y >= crop.y - tolerance && pointer.y <= rectBottom(crop) + tolerance;
    if (spanX && near(pointer.y, crop.y, tolerance)) return { type: 'handle', handle: 'n' };
    if (spanX && near(pointer.y, rectBottom(crop), tolerance)) return { type: 'handle', handle: 's' };
    if (spanY && near(pointer.x, crop.x, tolerance)) return { type: 'handle', handle: 'w' };
    if (spanY && near(pointer.x, rectRight(crop), tolerance)) return { type: 'handle', handle: 'e' };
  }

  // Face labels stay clickable even over the crop, so a face can always be chosen from the canvas.
  for (const face of faces) {
    if (inside(pointer, chipRect(face.box, scale))) return { type: 'chip', faceId: face.id };
  }

  if (crop && insideCropShape(pointer, crop, shape)) return { type: 'move' };
  return { type: 'none' };
}

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

export function cursorFor(target: HitTarget, panning: boolean): string {
  if (panning) return 'grab';
  switch (target.type) {
    case 'handle':
      return HANDLE_CURSORS[target.handle];
    case 'chip':
      return 'pointer';
    case 'move':
      return 'move';
    case 'none':
      return 'crosshair';
  }
}
