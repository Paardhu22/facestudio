'use client';

import { Slider } from 'radix-ui';

import { cn } from '@/lib/utils';

type ParamSliderProps = {
  label: string;
  testId: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text for the readout and `aria-valuetext`, for example "42%". */
  format: (value: number) => string;
  disabled?: boolean;
  onLive: (value: number) => void;
  onCommit: () => void;
  className?: string;
};

/** A labeled slider with a live readout. Dragging calls `onLive` per tick and `onCommit` once on release (SKILLS.md §D.5). */
export function ParamSlider({
  label,
  testId,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onLive,
  onCommit,
  className,
}: ParamSliderProps) {
  const id = `slider-${testId}`;
  return (
    <div className={cn('flex flex-col gap-1', className)} data-testid={testId}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-ui text-fg-secondary">
          {label}
        </label>
        <span className="text-ui-sm text-fg tabular-nums" data-testid={`${testId}-value`}>
          {format(value)}
        </span>
      </div>
      <Slider.Root
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={([next]) => next !== undefined && onLive(next)}
        onValueCommit={onCommit}
        className="relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50"
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-line">
          <Slider.Range className="absolute h-full rounded-full bg-brand" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          aria-valuetext={format(value)}
          data-testid={`${testId}-thumb`}
          className="block size-3 rounded-full border border-surface-app bg-fg shadow-elev-1 outline-none hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </Slider.Root>
    </div>
  );
}
