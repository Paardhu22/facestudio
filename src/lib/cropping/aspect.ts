import type { AspectRatio, AspectRatioPreset, Size } from '@/types/domain';

/** Aspect ratios (SKILLS.md §E-6, §E-9). A ratio is width / height; `null` means free (unconstrained). */

export const ASPECT_PRESETS = [
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
  '16:9',
  'original',
  'free',
  'custom',
] as const satisfies readonly AspectRatioPreset[];

const FIXED: Partial<Record<AspectRatioPreset, number>> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '2:3': 2 / 3,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
};

export const MIN_CUSTOM_RATIO = 0.1;
export const MAX_CUSTOM_RATIO = 10;

export const PRESET_LABELS: Record<AspectRatioPreset, string> = {
  '1:1': '1:1',
  '4:5': '4:5',
  '3:4': '3:4',
  '2:3': '2:3',
  '9:16': '9:16',
  '16:9': '16:9',
  original: 'Original',
  free: 'Free',
  custom: 'Custom',
};

/** The numeric ratio for an aspect setting, or `null` when free. `original` follows the image's own proportions. */
export function resolveAspect(aspect: AspectRatio, image: Size): number | null {
  if (aspect.preset === 'free') return null;
  if (aspect.preset === 'original') return image.width / image.height;
  if (aspect.preset === 'custom') {
    const value = aspect.value;
    return value !== null && Number.isFinite(value) && value >= MIN_CUSTOM_RATIO && value <= MAX_CUSTOM_RATIO
      ? value
      : null;
  }
  return FIXED[aspect.preset] ?? null;
}

/** Build an aspect setting. `custom` needs a ratio (clamped to a sane range); other presets ignore it. */
export function makeAspect(preset: AspectRatioPreset, customRatio?: number): AspectRatio {
  if (preset === 'custom') {
    const ratio = customRatio !== undefined && Number.isFinite(customRatio) ? customRatio : 1;
    return { preset, value: Math.min(MAX_CUSTOM_RATIO, Math.max(MIN_CUSTOM_RATIO, ratio)) };
  }
  return { preset, value: preset === 'original' || preset === 'free' ? null : (FIXED[preset] ?? null) };
}

export const DEFAULT_ASPECT: AspectRatio = makeAspect('4:5');
export const FREE_ASPECT: AspectRatio = makeAspect('free');

/** Parse "4:5", "4/5", "4x5", "1.25" or "1,25" into a ratio, or `null` when it is not a usable positive number. */
export function parseRatioText(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  const parts = cleaned.split(/[:/xX×]/);
  let value: number;
  if (parts.length === 2) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!(a > 0) || !(b > 0)) return null;
    value = a / b;
  } else if (parts.length === 1) {
    value = Number(cleaned);
  } else return null;
  return Number.isFinite(value) && value >= MIN_CUSTOM_RATIO && value <= MAX_CUSTOM_RATIO ? value : null;
}
