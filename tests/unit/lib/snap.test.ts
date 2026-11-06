import { describe, expect, it } from 'vitest';
import { snapCropCenter } from '@/lib/cropping/snap';

describe('crop center magnets', () => {
  const image = { width: 400, height: 300 };
  it('snaps each axis independently within six screen pixels', () => {
    const rect = { x: 103, y: 30, width: 200, height: 100 };
    expect(snapCropCenter(rect, image, 1)).toEqual({ rect: { ...rect, x: 100 }, x: true, y: false });
    expect(snapCropCenter({ ...rect, y: 103 }, image, 1).rect).toMatchObject({ x: 100, y: 100 });
  });
  it('uses screen pixels at every zoom and leaves crops outside the zone unchanged', () => {
    const rect = { x: 110, y: 90, width: 200, height: 100 };
    expect(snapCropCenter(rect, image, 0.5).rect).toMatchObject({ x: 100, y: 100 });
    expect(snapCropCenter(rect, image, 1)).toEqual({ rect, x: false, y: false });
    expect(snapCropCenter({ ...rect, x: 101 }, image, 8).x).toBe(false);
  });
  it('returns integer centers bounded by odd-size images', () => {
    expect(snapCropCenter({ x: 1, y: 1, width: 98, height: 98 }, { width: 101, height: 101 }, 1).rect).toEqual({
      x: 2,
      y: 2,
      width: 98,
      height: 98,
    });
  });
});
