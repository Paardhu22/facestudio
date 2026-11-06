import type { AspectRatio, CropShape, Point, Rect, Size } from '@/types/domain';

export const CROP_SHAPES = ['rectangle', 'square', 'circle', 'hexagon'] as const;
export const SHAPE_LABELS: Record<CropShape, string> = {
  rectangle: 'Rectangle',
  square: 'Square',
  circle: 'Circle',
  hexagon: 'Hexagon',
};

export const isEqualSided = (shape: CropShape | undefined): boolean => shape === 'circle' || shape === 'square';
export const shapeAspect = (shape: CropShape | undefined, aspect: AspectRatio): AspectRatio =>
  isEqualSided(shape) ? { preset: '1:1', value: 1 } : aspect;

/** One vector definition for canvas outlines, clipping, and full-resolution export masks. */
export function cropShapePath(rect: Rect, shape: CropShape = 'rectangle'): string {
  const { x, y, width: w, height: h } = rect;
  if (shape === 'circle') {
    return `M ${x} ${y + h / 2} a ${w / 2} ${h / 2} 0 1 0 ${w} 0 a ${w / 2} ${h / 2} 0 1 0 ${-w} 0 Z`;
  }
  if (shape === 'hexagon') {
    return `M ${x + w / 4} ${y} L ${x + (3 * w) / 4} ${y} L ${x + w} ${y + h / 2} L ${x + (3 * w) / 4} ${y + h} L ${x + w / 4} ${y + h} L ${x} ${y + h / 2} Z`;
  }
  return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
}

export function insideCropShape(point: Point, rect: Rect, shape: CropShape = 'rectangle'): boolean {
  const x = (point.x - rect.x) / rect.width;
  const y = (point.y - rect.y) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  if (shape === 'circle') return (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.25;
  if (shape === 'hexagon') return Math.abs(x - 0.5) <= 0.5 - Math.abs(y - 0.5) / 2;
  return true;
}

/** Cover trims the original shape alongside its pixels; stretch intentionally distorts both. */
export function resizedShapeRect(crop: Size, rendered: Size, cover: boolean): Rect {
  if (!cover) return { x: 0, y: 0, ...rendered };
  const scale = Math.max(rendered.width / crop.width, rendered.height / crop.height);
  const width = crop.width * scale;
  const height = crop.height * scale;
  return { x: (rendered.width - width) / 2, y: (rendered.height - height) / 2, width, height };
}

export function cropMaskSvg(size: Size, rect: Rect, shape: CropShape): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><path d="${cropShapePath(rect, shape)}" fill="white"/></svg>`;
}
