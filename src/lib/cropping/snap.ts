import type { Rect, Size } from '@/types/domain';

/** A screen-space magnetic zone, independent of zoom. Alt bypasses snapping in the caller. */
export function snapCropCenter(rect: Rect, image: Size, scale: number) {
  const centerX = Math.round((image.width - rect.width) / 2);
  const centerY = Math.round((image.height - rect.height) / 2);
  const x = Math.abs(rect.x - centerX) * scale <= 6;
  const y = Math.abs(rect.y - centerY) * scale <= 6;
  return { rect: { ...rect, x: x ? centerX : rect.x, y: y ? centerY : rect.y }, x, y };
}
