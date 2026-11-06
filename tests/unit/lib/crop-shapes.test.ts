import { describe, expect, it } from 'vitest';
import { cropShapePath, insideCropShape, resizedShapeRect } from '@/lib/cropping/shapes';
import { hitTest } from '@/lib/cropping/hit-test';
import { buildCrop, DEFAULT_FRAMING, normalizeCropShape } from '@/lib/cropping/build';
import { FREE_ASPECT } from '@/lib/cropping/aspect';
import { cropSchema } from '@/lib/api/schemas';

const rect = { x: 20, y: 30, width: 200, height: 200 };
describe('crop vector geometry', () => {
  it('uses the actual curved and polygon interiors for move targets, with handles taking priority', () => {
    expect(insideCropShape({ x: 120, y: 130 }, rect, 'circle')).toBe(true);
    expect(hitTest({ x: 45, y: 55 }, 1, rect, [], 'circle').type).toBe('none');
    expect(hitTest({ x: 45, y: 55 }, 1, rect, [], 'hexagon').type).toBe('none');
    expect(hitTest({ x: 120, y: 130 }, 1, rect, [], 'hexagon').type).toBe('move');
    expect(hitTest({ x: 20, y: 30 }, 1, rect, [], 'circle')).toEqual({ type: 'handle', handle: 'nw' });
    expect(hitTest({ x: 45, y: 55 }, 1, rect, []).type).toBe('move');
  });
  it('places the shared hexagon at the frame edges and preserves the original mask during cover resize', () => {
    expect(cropShapePath(rect, 'hexagon')).toContain('M 70 30 L 170 30 L 220 130');
    expect(resizedShapeRect({ width: 200, height: 100 }, { width: 100, height: 100 }, true)).toEqual({
      x: -50,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(resizedShapeRect(rect, { width: 120, height: 60 }, false)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
  });
  it('reads legacy rectangular crops and rejects unknown shapes', () => {
    const built = buildCrop({
      image: { width: 400, height: 300 },
      mode: 'custom',
      aspect: FREE_ASPECT,
      framing: DEFAULT_FRAMING,
      faces: null,
      faceId: null,
      previous: null,
    });
    if (!built.ok) throw new Error('Expected crop');
    const legacy = { ...built.crop };
    delete legacy.shape;
    expect(cropSchema.safeParse(legacy).success).toBe(true);
    expect(cropSchema.safeParse({ ...legacy, shape: 'triangle' }).success).toBe(false);
    const normalized = normalizeCropShape({ ...legacy, shape: 'circle' }, { width: 400, height: 300 });
    expect(normalized.rect.width).toBe(normalized.rect.height);
    expect(normalized.aspect).toEqual({ preset: '1:1', value: 1 });
  });
});
