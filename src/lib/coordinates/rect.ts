import type { Point, Rect, Size } from '@/types/domain';

/**
 * Rectangle geometry for crops (SKILLS.md §E-6, ADR-007). Everything is in ORIENTED ORIGINAL PIXEL SPACE: the image after
 * EXIF orientation, with the origin at its top-left. Functions are pure and never mutate their inputs.
 *
 * Live (drag) values may be fractional; `commitRect` produces the integer rectangle that is stored and exported.
 */

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const rectRight = (r: Rect): number => r.x + r.width;
export const rectBottom = (r: Rect): number => r.y + r.height;
export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export const rectsEqual = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** The smallest allowed side on each axis: the configured minimum, or the image side when the image is smaller. */
export function minSizeFor(bounds: Size, minSide: number): Size {
  return { width: Math.min(minSide, bounds.width), height: Math.min(minSide, bounds.height) };
}

/** Shrink to fit the bounds, then move inside them. */
export function clampRect(r: Rect, bounds: Size): Rect {
  const width = Math.min(r.width, bounds.width);
  const height = Math.min(r.height, bounds.height);
  return {
    x: clamp(r.x, 0, bounds.width - width),
    y: clamp(r.y, 0, bounds.height - height),
    width,
    height,
  };
}

export function moveRect(r: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...r,
    x: clamp(r.x + dx, 0, bounds.width - r.width),
    y: clamp(r.y + dy, 0, bounds.height - r.height),
  };
}

/** The largest `aspect` (width / height) rectangle that fits in `max`. */
export function sizeWithAspectInside(max: Size, aspect: number): Size {
  const width = Math.min(max.width, max.height * aspect);
  return { width, height: width / aspect };
}

/** A centered rectangle with the given aspect, covering `fill` (0..1] of the largest rectangle that fits. */
export function centeredRectWithAspect(bounds: Size, aspect: number, fill = 1): Rect {
  const size = sizeWithAspectInside(bounds, aspect);
  const width = size.width * fill;
  const height = size.height * fill;
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}

/**
 * Resize by dragging a handle. `pointer` is the current pointer position in image pixels. The edge or corner opposite the
 * handle stays fixed. The result always lies inside `bounds` and is never smaller than `minSide` (or the image side if
 * smaller). With `aspect` (width / height) the ratio is preserved exactly: corners follow whichever axis the pointer
 * moved further, edges grow around the rectangle's center on the other axis.
 */
export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  pointer: Point,
  bounds: Size,
  options: { aspect: number | null; minSide: number },
): Rect {
  const min = minSizeFor(bounds, options.minSide);
  const left = start.x;
  const top = start.y;
  const right = rectRight(start);
  const bottom = rectBottom(start);
  const movesW = handle.includes('w');
  const movesE = handle.includes('e');
  const movesN = handle.includes('n');
  const movesS = handle.includes('s');

  const aspect = options.aspect;
  if (aspect === null || !Number.isFinite(aspect) || aspect <= 0) {
    let l = left;
    let t = top;
    let r = right;
    let b = bottom;
    if (movesW) l = clamp(pointer.x, 0, right - min.width);
    if (movesE) r = clamp(pointer.x, left + min.width, bounds.width);
    if (movesN) t = clamp(pointer.y, 0, bottom - min.height);
    if (movesS) b = clamp(pointer.y, top + min.height, bounds.height);
    return { x: l, y: t, width: r - l, height: b - t };
  }

  // Smallest width that satisfies both minimum sides at this aspect.
  const minW = Math.max(min.width, min.height * aspect);
  const isCorner = handle.length === 2;

  if (isCorner) {
    const dirX = movesE ? 1 : -1;
    const dirY = movesS ? 1 : -1;
    const ax = movesE ? left : right;
    const ay = movesS ? top : bottom;
    const wantW = Math.max(0, (pointer.x - ax) * dirX);
    const wantH = Math.max(0, (pointer.y - ay) * dirY);
    const maxW = Math.min(dirX > 0 ? bounds.width - ax : ax, (dirY > 0 ? bounds.height - ay : ay) * aspect);
    const width = clamp(Math.max(wantW, wantH * aspect), Math.min(minW, maxW), maxW);
    const height = width / aspect;
    return { x: dirX > 0 ? ax : ax - width, y: dirY > 0 ? ay : ay - height, width, height };
  }

  if (movesE || movesW) {
    const dirX = movesE ? 1 : -1;
    const ax = movesE ? left : right;
    const cy = start.y + start.height / 2;
    const maxH = 2 * Math.min(cy, bounds.height - cy);
    const maxW = Math.min(dirX > 0 ? bounds.width - ax : ax, maxH * aspect);
    const width = clamp((pointer.x - ax) * dirX, Math.min(minW, maxW), maxW);
    const height = width / aspect;
    return { x: dirX > 0 ? ax : ax - width, y: cy - height / 2, width, height };
  }

  const dirY = movesS ? 1 : -1;
  const ay = movesS ? top : bottom;
  const cx = start.x + start.width / 2;
  const maxW = 2 * Math.min(cx, bounds.width - cx);
  const maxH = Math.min(dirY > 0 ? bounds.height - ay : ay, maxW / aspect);
  const minH = minW / aspect;
  const height = clamp((pointer.y - ay) * dirY, Math.min(minH, maxH), maxH);
  const width = height * aspect;
  return { x: cx - width / 2, y: dirY > 0 ? ay : ay - height, width, height };
}

/** Rectangle spanned by a drag from `from` to `to`, clamped to the bounds. With `aspect`, the ratio is preserved. */
export function rectFromDrag(
  from: Point,
  to: Point,
  bounds: Size,
  options: { aspect: number | null; minSide: number },
): Rect {
  const sx = clamp(from.x, 0, bounds.width);
  const sy = clamp(from.y, 0, bounds.height);
  const seed: Rect = { x: sx, y: sy, width: 0, height: 0 };
  const dx = to.x - sx;
  const dy = to.y - sy;
  const handle: ResizeHandle = `${dy >= 0 ? 's' : 'n'}${dx >= 0 ? 'e' : 'w'}` as ResizeHandle;
  const drawn = resizeRect(seed, handle, to, bounds, options);

  // A drag that starts at (or ends against) an image edge cannot grow outward to the minimum size. Instead of returning a
  // sliver, grow to the minimum and shift the box inside the image.
  const min = minSizeFor(bounds, options.minSide);
  const aspect = options.aspect;
  const locked = aspect !== null && Number.isFinite(aspect) && aspect > 0;
  const width = locked ? Math.max(drawn.width, min.width, min.height * aspect) : Math.max(drawn.width, min.width);
  const height = locked ? width / aspect : Math.max(drawn.height, min.height);
  return clampRect({ x: drawn.x, y: drawn.y, width, height }, bounds);
}

/**
 * Round a (possibly fractional) rectangle to the integer rectangle that is stored and exported (ADR-007). It stays inside
 * the bounds and at least the minimum size; with `aspect`, width and height are chosen so the integer ratio is as close
 * as possible to the requested one (error below one pixel on the shorter side).
 */
export function commitRect(r: Rect, bounds: Size, options: { aspect: number | null; minSide: number }): Rect {
  const min = minSizeFor(bounds, options.minSide);
  const aspect = options.aspect;

  let width: number;
  let height: number;
  if (aspect === null || !Number.isFinite(aspect) || aspect <= 0) {
    width = clamp(Math.round(r.width), min.width, bounds.width);
    height = clamp(Math.round(r.height), min.height, bounds.height);
  } else {
    // Try the two integer heights around the exact one and keep the pair whose ratio is closest.
    let best: { w: number; h: number; error: number } | null = null;
    for (const h of [Math.floor(r.height), Math.ceil(r.height)]) {
      const hClamped = clamp(h, 1, bounds.height);
      const w = Math.round(hClamped * aspect);
      const error = Math.abs(w / hClamped - aspect);
      if (!best || error < best.error) best = { w, h: hClamped, error };
    }
    width = best?.w ?? Math.round(r.width);
    height = best?.h ?? Math.round(r.height);
    // Below the minimum size: grow BOTH sides together so the ratio survives (never raise just one side).
    if (width < min.width || height < min.height) {
      width = Math.ceil(Math.max(min.width, min.height * aspect));
      height = Math.max(1, Math.round(width / aspect));
    }
    if (width > bounds.width) {
      width = bounds.width;
      height = Math.max(1, Math.round(width / aspect));
    }
    if (height > bounds.height) {
      height = bounds.height;
      width = Math.max(1, Math.round(height * aspect));
    }
  }
  return {
    x: clamp(Math.round(r.x), 0, bounds.width - width),
    y: clamp(Math.round(r.y), 0, bounds.height - height),
    width,
    height,
  };
}

/** True when `inner` lies completely within `bounds`. */
export const isInside = (inner: Rect, bounds: Size): boolean =>
  inner.x >= 0 && inner.y >= 0 && rectRight(inner) <= bounds.width && rectBottom(inner) <= bounds.height;
