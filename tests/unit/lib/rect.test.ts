import { describe, expect, it } from 'vitest';

import {
  centeredRectWithAspect,
  clampRect,
  commitRect,
  isInside,
  moveRect,
  RESIZE_HANDLES,
  type ResizeHandle,
  rectBottom,
  rectFromDrag,
  rectRight,
  resizeRect,
  sizeWithAspectInside,
} from '@/lib/coordinates/rect';
import type { Rect, Size } from '@/types/domain';

const bounds: Size = { width: 1000, height: 800 };
const EPS = 1e-6;

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('clampRect / moveRect', () => {
  it('moves a rectangle inside the bounds and shrinks one that is too large', () => {
    expect(clampRect({ x: -50, y: 900, width: 200, height: 100 }, bounds)).toEqual({
      x: 0,
      y: 700,
      width: 200,
      height: 100,
    });
    expect(clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });

  it('never lets a drag push a rectangle outside the image', () => {
    const r: Rect = { x: 100, y: 100, width: 300, height: 200 };
    expect(moveRect(r, -500, -500, bounds)).toMatchObject({ x: 0, y: 0 });
    expect(moveRect(r, 5000, 5000, bounds)).toMatchObject({ x: 700, y: 600 });
    expect(moveRect(r, 10, -20, bounds)).toEqual({ x: 110, y: 80, width: 300, height: 200 });
  });
});

describe('aspect helpers', () => {
  it('sizeWithAspectInside returns the largest rectangle of that ratio that fits', () => {
    expect(sizeWithAspectInside(bounds, 1)).toEqual({ width: 800, height: 800 });
    expect(sizeWithAspectInside(bounds, 2)).toEqual({ width: 1000, height: 500 });
  });
  it('centeredRectWithAspect centers and scales', () => {
    expect(centeredRectWithAspect(bounds, 1, 0.5)).toEqual({ x: 300, y: 200, width: 400, height: 400 });
  });
});

describe('resizeRect: free (no aspect lock)', () => {
  const start: Rect = { x: 200, y: 150, width: 400, height: 300 };
  const opts = { aspect: null, minSide: 16 };

  it('moves only the edges the handle controls and keeps the opposite edges fixed', () => {
    const e = resizeRect(start, 'e', { x: 800, y: 9999 }, bounds, opts);
    expect(e).toEqual({ x: 200, y: 150, width: 600, height: 300 }); // y ignored for an edge handle
    const nw = resizeRect(start, 'nw', { x: 100, y: 50 }, bounds, opts);
    expect(nw).toEqual({ x: 100, y: 50, width: 500, height: 400 });
    expect(rectRight(nw)).toBe(rectRight(start));
    expect(rectBottom(nw)).toBe(rectBottom(start));
  });

  it('stops at the image edges and at the minimum size', () => {
    expect(resizeRect(start, 'se', { x: 5000, y: 5000 }, bounds, opts)).toEqual({
      x: 200,
      y: 150,
      width: 800,
      height: 650,
    });
    const tiny = resizeRect(start, 'se', { x: 0, y: 0 }, bounds, opts);
    expect(tiny.width).toBe(16);
    expect(tiny.height).toBe(16);
    expect(tiny.x).toBe(200); // the anchor corner never moves
  });

  it('cannot be dragged past the opposite edge (no negative or flipped rectangles)', () => {
    const r = resizeRect(start, 'w', { x: 900, y: 0 }, bounds, opts);
    expect(r.width).toBe(16);
    expect(rectRight(r)).toBe(rectRight(start));
  });

  it('uses the image side as the minimum when the image is smaller than the minimum', () => {
    const r = resizeRect({ x: 0, y: 0, width: 10, height: 10 }, 'se', { x: 0, y: 0 }, { width: 10, height: 10 }, opts);
    expect(r).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe('resizeRect: aspect locked', () => {
  const aspect = 4 / 5;
  const start: Rect = { x: 300, y: 100, width: 320, height: 400 };
  const opts = { aspect, minSide: 16 };

  it('keeps the ratio exactly for corner and edge handles', () => {
    for (const handle of RESIZE_HANDLES) {
      const r = resizeRect(start, handle, { x: 700, y: 650 }, bounds, opts);
      expect(Math.abs(r.width / r.height - aspect)).toBeLessThan(EPS);
    }
  });

  it('a corner drag follows whichever axis the pointer moved further', () => {
    const wide = resizeRect(start, 'se', { x: 800, y: 400 }, bounds, opts); // 500 right of the anchor, only 300 below it
    expect(wide.width).toBeCloseTo(500, 6);
    expect(wide.height).toBeCloseTo(625, 6);
    const tall = resizeRect(start, 'se', { x: 640, y: 600 }, bounds, opts); // 340 right of the anchor, 500 below it
    expect(tall.height).toBeCloseTo(500, 6);
    expect(tall.width).toBeCloseTo(400, 6);
  });

  it('is limited by whichever image edge it reaches first', () => {
    // Wide pointer, but the rectangle can only be 700 tall below the anchor, so 560 wide at 4:5.
    const r = resizeRect(start, 'se', { x: 900, y: 520 }, bounds, opts);
    expect(r.width).toBeCloseTo(560, 6);
    expect(isInside(r, bounds)).toBe(true);
  });

  it('edge handles grow around the center of the other axis', () => {
    const r = resizeRect(start, 'e', { x: 740, y: 0 }, bounds, opts);
    expect(r.width).toBeCloseTo(440, 6);
    expect(r.y + r.height / 2).toBeCloseTo(start.y + start.height / 2, 6);
  });

  it('stays inside the image even when the ratio would push it out', () => {
    const r = resizeRect(start, 'e', { x: 5000, y: 0 }, bounds, opts);
    expect(isInside(r, bounds)).toBe(true);
    expect(Math.abs(r.width / r.height - aspect)).toBeLessThan(EPS);
  });
});

describe('resizeRect: invariants over thousands of random drags', () => {
  const next = rng(20260504);
  const aspects: (number | null)[] = [null, 1, 4 / 5, 3 / 4, 2 / 3, 9 / 16, 16 / 9, 0.37, 2.9];

  /** A rectangle that is a legal starting point: inside the image and at least `minSide` on each side. */
  function randomStart(aspect: number | null, minSide: number): Rect {
    for (let attempt = 0; attempt < 200; attempt++) {
      const ratio = aspect ?? 0.4 + next() * 2;
      const minWidth = Math.max(minSide, minSide * ratio);
      const width = minWidth + next() * (bounds.width - minWidth);
      const height = width / ratio;
      if (height < minSide || height > bounds.height) continue;
      return { x: next() * (bounds.width - width), y: next() * (bounds.height - height), width, height };
    }
    const fallback = Math.max(minSide, 100);
    return { x: 100, y: 100, width: fallback * (aspect ?? 1), height: fallback };
  }

  it('always stays inside the image, never below the minimum, and keeps the aspect ratio', () => {
    for (let i = 0; i < 6000; i++) {
      const aspect = aspects[i % aspects.length] ?? null;
      const minSide = [1, 16, 64][i % 3] ?? 16;
      const start = randomStart(aspect, minSide);
      const handle: ResizeHandle = RESIZE_HANDLES[Math.floor(next() * 8)] ?? 'se';
      const pointer = { x: -200 + next() * (bounds.width + 400), y: -200 + next() * (bounds.height + 400) };

      const r = resizeRect(start, handle, pointer, bounds, { aspect, minSide });

      const context = `#${i} handle=${handle} aspect=${aspect} start=${JSON.stringify(start)} pointer=${JSON.stringify(pointer)} → ${JSON.stringify(r)}`;
      expect(Number.isFinite(r.x + r.y + r.width + r.height), context).toBe(true);
      expect(r.x, context).toBeGreaterThanOrEqual(-EPS);
      expect(r.y, context).toBeGreaterThanOrEqual(-EPS);
      expect(rectRight(r), context).toBeLessThanOrEqual(bounds.width + EPS);
      expect(rectBottom(r), context).toBeLessThanOrEqual(bounds.height + EPS);
      expect(r.width, context).toBeGreaterThanOrEqual(Math.min(minSide, bounds.width) - EPS);
      expect(r.height, context).toBeGreaterThanOrEqual(Math.min(minSide, bounds.height) - EPS);
      if (aspect !== null) expect(Math.abs(r.width / r.height - aspect), context).toBeLessThan(1e-6);
    }
  });

  it('free resizes keep the opposite edges of the handle exactly where they were', () => {
    for (let i = 0; i < 2000; i++) {
      const start = randomStart(null, 16);
      const handle: ResizeHandle = RESIZE_HANDLES[Math.floor(next() * 8)] ?? 'se';
      const pointer = { x: next() * bounds.width, y: next() * bounds.height };
      const r = resizeRect(start, handle, pointer, bounds, { aspect: null, minSide: 16 });
      if (!handle.includes('w')) expect(r.x).toBeCloseTo(start.x, 6);
      if (!handle.includes('e')) expect(rectRight(r)).toBeCloseTo(rectRight(start), 6);
      if (!handle.includes('n')) expect(r.y).toBeCloseTo(start.y, 6);
      if (!handle.includes('s')) expect(rectBottom(r)).toBeCloseTo(rectBottom(start), 6);
    }
  });
});

describe('rectFromDrag (draw a new box)', () => {
  it('spans the drag in any direction and is clamped to the image', () => {
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 400, y: 300 }, bounds, { aspect: null, minSide: 16 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
    expect(rectFromDrag({ x: 400, y: 300 }, { x: 100, y: 100 }, bounds, { aspect: null, minSide: 16 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
    const out = rectFromDrag({ x: 900, y: 700 }, { x: 5000, y: 5000 }, bounds, { aspect: null, minSide: 16 });
    expect(isInside(out, bounds)).toBe(true);
  });
  it('keeps the aspect ratio while drawing', () => {
    const r = rectFromDrag({ x: 100, y: 100 }, { x: 500, y: 250 }, bounds, { aspect: 1, minSide: 16 });
    expect(r.width).toBeCloseTo(r.height, 6);
    expect(isInside(r, bounds)).toBe(true);
  });
  it('a zero-length drag yields the minimum size, still inside the image', () => {
    const r = rectFromDrag({ x: 999, y: 799 }, { x: 999, y: 799 }, bounds, { aspect: null, minSide: 16 });
    expect(isInside(r, bounds)).toBe(true);
    expect(r.width).toBeGreaterThanOrEqual(16);
  });
});

describe('commitRect (integers for storage and export)', () => {
  it('rounds to integers inside the bounds', () => {
    const r = commitRect({ x: 10.4, y: 20.6, width: 99.5, height: 50.2 }, bounds, { aspect: null, minSide: 16 });
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
    expect(isInside(r, bounds)).toBe(true);
  });

  it('keeps an aspect ratio to within one pixel on the shorter side', () => {
    const next = rng(77);
    for (let i = 0; i < 3000; i++) {
      const aspect = [1, 4 / 5, 3 / 4, 2 / 3, 9 / 16, 16 / 9, 0.37][i % 7] ?? 1;
      const height = 30 + next() * 700;
      const width = height * aspect;
      if (width > bounds.width) continue;
      const rect = { x: next() * (bounds.width - width), y: next() * (bounds.height - height), width, height };
      const r = commitRect(rect, bounds, { aspect, minSide: 16 });
      expect(isInside(r, bounds)).toBe(true);
      expect(Math.abs(r.width / r.height - aspect)).toBeLessThanOrEqual(1 / Math.min(r.width, r.height) + 1e-9);
    }
  });

  it('shrinks a rectangle that cannot fit at its ratio rather than leaving the image', () => {
    const r = commitRect({ x: 0, y: 0, width: 1500, height: 1500 }, bounds, { aspect: 1, minSide: 16 });
    expect(isInside(r, bounds)).toBe(true);
    expect(r.width).toBe(r.height);
  });

  it('is idempotent', () => {
    const once = commitRect({ x: 12.3, y: 45.6, width: 321.7, height: 400.2 }, bounds, { aspect: 4 / 5, minSide: 16 });
    expect(commitRect(once, bounds, { aspect: 4 / 5, minSide: 16 })).toEqual(once);
  });
});
