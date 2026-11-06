import type { Point, Rect, Size } from '@/types/domain';

import { clamp } from './rect';

/**
 * Mapping between image pixels and screen pixels for the canvas (SKILLS.md §E-5). `scale` is screen pixels per image
 * pixel, so `scale = 1` is "100%": one original pixel per CSS pixel.
 */
export type ViewTransform = { scale: number; x: number; y: number };

export const MIN_VIEW_SCALE = 0.02;
export const MAX_VIEW_SCALE = 16;

export const imageToScreen = (view: ViewTransform, p: Point): Point => ({
  x: p.x * view.scale + view.x,
  y: p.y * view.scale + view.y,
});

export const screenToImage = (view: ViewTransform, p: Point): Point => ({
  x: (p.x - view.x) / view.scale,
  y: (p.y - view.y) / view.scale,
});

/** Scale and center the whole image in the viewport, leaving `padding` screen pixels around it. Never enlarges past 100%. */
export function fitView(image: Size, viewport: Size, padding = 24): ViewTransform {
  const availW = Math.max(1, viewport.width - padding * 2);
  const availH = Math.max(1, viewport.height - padding * 2);
  const scale = clamp(Math.min(availW / image.width, availH / image.height), MIN_VIEW_SCALE, 1);
  return centerView(image, viewport, scale);
}

/** The view at `scale`, with the image centered in the viewport. */
export function centerView(image: Size, viewport: Size, scale: number): ViewTransform {
  return { scale, x: (viewport.width - image.width * scale) / 2, y: (viewport.height - image.height * scale) / 2 };
}

/** Fit a crop without changing its original-image coordinates or enlarging beyond actual pixels. */
export function fitRectView(rect: Rect, viewport: Size, padding = 48): ViewTransform {
  const view = fitView(rect, viewport, padding);
  return { ...view, x: view.x - rect.x * view.scale, y: view.y - rect.y * view.scale };
}

/** Fill the editing area with the crop, leaving room above for tools and below for zoom/dimensions. */
export function focusCropView(rect: Rect, viewport: Size): ViewTransform {
  const width = Math.max(1, viewport.width - 96);
  const height = Math.max(1, viewport.height - 176);
  const scale = clamp(Math.min(width / rect.width, height / rect.height), MIN_VIEW_SCALE, MAX_VIEW_SCALE);
  return {
    scale,
    x: viewport.width / 2 - (rect.x + rect.width / 2) * scale,
    y: 96 + height / 2 - (rect.y + rect.height / 2) * scale,
  };
}

/** An exact endpoint and an ease-out camera path; crop instructions never change. */
export function interpolateView(from: ViewTransform, to: ViewTransform, progress: number): ViewTransform {
  const t = 1 - (1 - clamp(progress, 0, 1)) ** 3;
  return {
    scale: from.scale + (to.scale - from.scale) * t,
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** Zoom by `factor`, keeping the image point under `anchor` (a screen position) where it is. */
export function zoomAt(view: ViewTransform, factor: number, anchor: Point): ViewTransform {
  const scale = clamp(view.scale * factor, MIN_VIEW_SCALE, MAX_VIEW_SCALE);
  const real = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * real, y: anchor.y - (anchor.y - view.y) * real };
}

export const panBy = (view: ViewTransform, dx: number, dy: number): ViewTransform => ({
  ...view,
  x: view.x + dx,
  y: view.y + dy,
});
