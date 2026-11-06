import { describe, expect, it } from 'vitest';

import { RESIZE_HANDLES } from '@/lib/coordinates/rect';
import { chipRect, cursorFor, handlePoints, hitTest } from '@/lib/cropping/hit-test';

const crop = { x: 200, y: 150, width: 400, height: 300 };
const noFaces: { id: `f${number}`; box: typeof crop }[] = [];

describe('handlePoints', () => {
  it('lists all eight handles at corners and edge midpoints', () => {
    const p = handlePoints(crop);
    expect(Object.keys(p).sort()).toEqual([...RESIZE_HANDLES].sort());
    expect(p.nw).toEqual({ x: 200, y: 150 });
    expect(p.se).toEqual({ x: 600, y: 450 });
    expect(p.n).toEqual({ x: 400, y: 150 });
    expect(p.w).toEqual({ x: 200, y: 300 });
  });
});

describe('hitTest', () => {
  it('finds each handle at its own position', () => {
    for (const [handle, point] of Object.entries(handlePoints(crop))) {
      expect(hitTest(point, 1, crop, noFaces)).toEqual({ type: 'handle', handle });
    }
  });

  it('corners win over edges where their zones overlap', () => {
    expect(hitTest({ x: 203, y: 153 }, 1, crop, noFaces)).toEqual({ type: 'handle', handle: 'nw' });
  });

  it('edge handles respond along the whole edge, not only at the midpoint', () => {
    expect(hitTest({ x: 260, y: 151 }, 1, crop, noFaces)).toEqual({ type: 'handle', handle: 'n' });
    expect(hitTest({ x: 601, y: 380 }, 1, crop, noFaces)).toEqual({ type: 'handle', handle: 'e' });
  });

  it('the grab reach is constant ON SCREEN: it shrinks in image pixels as you zoom in, and grows as you zoom out', () => {
    const justOff = { x: 200 - 6, y: 300 };
    expect(hitTest(justOff, 1, crop, noFaces).type).toBe('handle'); // 6 image px = 6 screen px: inside the 10px reach
    expect(hitTest(justOff, 4, crop, noFaces).type).toBe('none'); // 6 image px = 24 screen px: outside it
    expect(hitTest({ x: 200 - 30, y: 300 }, 0.25, crop, noFaces).type).toBe('handle'); // 30 image px = 7.5 screen px
  });

  it('the inside of the crop moves it; outside is empty', () => {
    expect(hitTest({ x: 400, y: 300 }, 1, crop, noFaces)).toEqual({ type: 'move' });
    expect(hitTest({ x: 50, y: 50 }, 1, crop, noFaces)).toEqual({ type: 'none' });
    expect(hitTest({ x: 400, y: 300 }, 1, null, noFaces)).toEqual({ type: 'none' });
  });

  it('face labels are clickable, even on top of the crop', () => {
    const face = { id: 'f1' as const, box: { x: 300, y: 250, width: 100, height: 120 } };
    const chip = chipRect(face.box, 1);
    expect(hitTest({ x: chip.x + 5, y: chip.y + 5 }, 1, crop, [face])).toEqual({ type: 'chip', faceId: 'f1' });
    expect(hitTest({ x: chip.x + 5, y: chip.y + 5 }, 1, null, [face])).toEqual({ type: 'chip', faceId: 'f1' });
  });

  it('a label has a constant on-screen size', () => {
    const box = { x: 100, y: 100, width: 50, height: 50 };
    expect(chipRect(box, 1).width).toBeCloseTo(62, 9);
    expect(chipRect(box, 2).width).toBeCloseTo(31, 9);
  });
});

describe('cursorFor', () => {
  it('matches the action, and shows a grab hand while panning', () => {
    expect(cursorFor({ type: 'handle', handle: 'nw' }, false)).toBe('nwse-resize');
    expect(cursorFor({ type: 'handle', handle: 'ne' }, false)).toBe('nesw-resize');
    expect(cursorFor({ type: 'handle', handle: 'n' }, false)).toBe('ns-resize');
    expect(cursorFor({ type: 'handle', handle: 'w' }, false)).toBe('ew-resize');
    expect(cursorFor({ type: 'move' }, false)).toBe('move');
    expect(cursorFor({ type: 'none' }, false)).toBe('crosshair');
    expect(cursorFor({ type: 'chip', faceId: 'f0' }, false)).toBe('pointer');
    expect(cursorFor({ type: 'move' }, true)).toBe('grab');
  });
});
