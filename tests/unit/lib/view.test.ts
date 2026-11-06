import { describe, expect, it } from 'vitest';

import {
  centerView,
  fitView,
  fitRectView,
  focusCropView,
  interpolateView,
  imageToScreen,
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  panBy,
  screenToImage,
  zoomAt,
} from '@/lib/coordinates/view';

const image = { width: 4000, height: 3000 };
const viewport = { width: 900, height: 700 };

describe('view transform', () => {
  it('focuses small crops beyond 100% while reserving usable space around all eight handles', () => {
    const rect = { x: 100, y: 50, width: 200, height: 100 };
    const view = focusCropView(rect, viewport);
    expect(view.scale).toBeGreaterThan(1);
    const start = imageToScreen(view, rect);
    const end = imageToScreen(view, { x: 300, y: 150 });
    expect(start.x).toBeGreaterThanOrEqual(48);
    expect(start.y).toBeGreaterThanOrEqual(96);
    expect(end.x).toBeLessThanOrEqual(viewport.width - 48);
    expect(end.y).toBeLessThanOrEqual(viewport.height - 80);
    expect((start.x + end.x) / 2).toBe(viewport.width / 2);
    expect(focusCropView({ ...rect, width: 1, height: 1 }, viewport).scale).toBe(MAX_VIEW_SCALE);
  });

  it('interpolates camera scale and translation without overshooting either endpoint', () => {
    const from = { scale: 0.2, x: -30, y: 150 };
    const to = { scale: 2, x: 40, y: -300 };
    expect(interpolateView(from, to, -1)).toEqual(from);
    expect(interpolateView(from, to, 2)).toEqual(to);
    const middle = interpolateView(from, to, 0.5);
    expect(middle.scale).toBeGreaterThan(from.scale);
    expect(middle.scale).toBeLessThan(to.scale);
    expect(middle.x).toBeGreaterThan(from.x);
    expect(middle.x).toBeLessThan(to.x);
    expect(middle.y).toBeGreaterThan(to.y);
    expect(middle.y).toBeLessThan(from.y);
  });
  it('fits an offset crop in the viewport without changing its coordinate space', () => {
    const crop = { x: 123, y: 456, width: 1200, height: 2000 };
    const view = fitRectView(crop, viewport, 48);
    const center = imageToScreen(view, { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 });
    expect(center).toEqual({ x: viewport.width / 2, y: viewport.height / 2 });
    expect(crop.height * view.scale).toBeCloseTo(viewport.height - 96);
    expect(fitRectView({ x: 100, y: 80, width: 80, height: 40 }, viewport).scale).toBe(1);
  });
  it('round-trips image ↔ screen coordinates', () => {
    const view = { scale: 0.37, x: 41, y: -12 };
    const p = { x: 1234.5, y: 987.25 };
    const back = screenToImage(view, imageToScreen(view, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('fit shows the whole image, centered, with padding, and never enlarges past 100%', () => {
    const view = fitView(image, viewport, 24);
    expect(image.width * view.scale).toBeLessThanOrEqual(viewport.width - 48 + 1e-9);
    expect(image.height * view.scale).toBeLessThanOrEqual(viewport.height - 48 + 1e-9);
    expect(view.x).toBeCloseTo((viewport.width - image.width * view.scale) / 2, 9);
    expect(fitView({ width: 100, height: 80 }, viewport).scale).toBe(1);
  });

  it('centerView places the image at an exact scale in the middle', () => {
    const v = centerView({ width: 200, height: 100 }, { width: 600, height: 400 }, 1);
    expect(v).toEqual({ scale: 1, x: 200, y: 150 });
  });

  it('zoomAt keeps the image point under the cursor fixed', () => {
    const view = fitView(image, viewport);
    const anchor = { x: 300, y: 250 };
    const before = screenToImage(view, anchor);
    const zoomed = zoomAt(view, 2.5, anchor);
    const after = screenToImage(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBeCloseTo(view.scale * 2.5, 9);
  });

  it('zoom is limited at both ends, and the anchor still holds at the limit', () => {
    let view = fitView(image, viewport);
    for (let i = 0; i < 100; i++) view = zoomAt(view, 1.5, { x: 100, y: 100 });
    expect(view.scale).toBe(MAX_VIEW_SCALE);
    for (let i = 0; i < 100; i++) view = zoomAt(view, 0.5, { x: 100, y: 100 });
    expect(view.scale).toBe(MIN_VIEW_SCALE);
  });

  it('panBy moves the view without changing scale', () => {
    expect(panBy({ scale: 2, x: 10, y: 20 }, 5, -7)).toEqual({ scale: 2, x: 15, y: 13 });
  });
});
