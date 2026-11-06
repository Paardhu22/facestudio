'use client';

import { RotateCcw } from 'lucide-react';
import { Slider } from 'radix-ui';

import {
  type AdjustmentDefinition,
  DEFAULT_ADJUSTMENTS,
  formatAdjustment,
} from '@/lib/image-processing/adjustment-spec';
import { cn } from '@/lib/utils';
import { useEditStore } from '@/stores/edit-store';
import type { ImageId } from '@/types/domain';

import { NumericField } from './numeric-field';

type AdjustmentSliderProps = { id: ImageId; definition: AdjustmentDefinition };

/** Slider tracks that carry meaning (SKILLS.md §B.10): cool→warm and green→magenta. */
const TRACK_GRADIENT: Partial<Record<AdjustmentDefinition['key'], string>> = {
  temperature: 'bg-linear-to-r from-temp-cool/70 to-temp-warm/70',
  tint: 'bg-linear-to-r from-tint-green/70 to-tint-magenta/70',
};

/**
 * One adjustment control: label, numeric field, reset, and a center-zero slider. Dragging updates the live preview
 * on every tick; ONE undo step is recorded on release (SKILLS.md §D.5). Double-click the label or slider to reset.
 */
export function AdjustmentSlider({ id, definition }: AdjustmentSliderProps) {
  const { key, label, min, max, step, defaultValue } = definition;
  const value = useEditStore((s) => (s.edits[id]?.adjustments ?? DEFAULT_ADJUSTMENTS)[key]);
  const gradient = TRACK_GRADIENT[key];
  const isDefault = value === defaultValue;

  const live = (next: number) => useEditStore.getState().setLive(id, { [key]: next });
  const commit = () => useEditStore.getState().commitGesture(label);
  const typed = (next: number) => {
    live(next);
    commit();
  };
  const reset = () => {
    if (isDefault) return;
    live(defaultValue);
    useEditStore.getState().commitGesture(`Reset ${label.toLowerCase()}`);
  };

  const zero = ((defaultValue - min) / (max - min)) * 100;
  const position = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-1" data-testid={`adjust-${key}`}>
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={`slider-${key}`}
          onDoubleClick={reset}
          title="Double-click to reset"
          className="flex-1 cursor-default text-ui text-fg-secondary select-none"
        >
          {label}
        </label>
        <button
          type="button"
          onClick={reset}
          aria-label={`Reset ${label.toLowerCase()}`}
          title={`Reset ${label.toLowerCase()}`}
          data-testid={`adjust-${key}-reset`}
          className={cn(
            'grid size-5 place-items-center rounded-sm text-fg-muted outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-brand',
            isDefault && 'invisible', // keeps the row stable; a non-default value makes it appear
          )}
        >
          <RotateCcw className="size-3" />
        </button>
        <NumericField definition={definition} value={value} onCommit={typed} />
      </div>

      <Slider.Root
        id={`slider-${key}`}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => next !== undefined && live(next)}
        onValueCommit={commit}
        onDoubleClick={reset}
        className="relative flex h-5 w-full touch-none items-center select-none"
      >
        <Slider.Track className={cn('relative h-1 grow rounded-full bg-line', gradient)}>
          {gradient ? null : (
            <span
              aria-hidden="true"
              className="absolute h-full rounded-full bg-brand"
              style={{ left: `${Math.min(zero, position)}%`, width: `${Math.abs(position - zero)}%` }}
            />
          )}
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong"
            style={{ left: `${zero}%` }}
          />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          aria-valuetext={formatAdjustment(key, value)}
          data-testid={`adjust-${key}-thumb`}
          className="block size-3 rounded-full border border-surface-app bg-fg shadow-elev-1 outline-none hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </Slider.Root>
    </div>
  );
}
