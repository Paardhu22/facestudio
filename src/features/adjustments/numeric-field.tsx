'use client';

import { useRef, useState } from 'react';

import type { AdjustmentDefinition } from '@/lib/image-processing/adjustment-spec';
import { cn } from '@/lib/utils';

type NumericFieldProps = {
  definition: AdjustmentDefinition;
  value: number;
  /** Called with a typed or stepped value (already a finite number; the store clamps and snaps it). */
  onCommit: (value: number) => void;
  className?: string;
};

const toText = (value: number, precision: number): string => value.toFixed(precision).replace('-', '−');
const parse = (text: string): number => Number(text.replace('−', '-').replace(',', '.').trim());

/**
 * Numeric input paired with a slider (SKILLS.md §B.10): ↑/↓ step, Shift+↑/↓ step ×10, Enter commits,
 * Escape reverts, blur commits. Unparseable text reverts instead of corrupting the value.
 */
export function NumericField({ definition, value, onCommit, className }: NumericFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs the field, and the blur handler would otherwise re-read the typed text and commit it.
  const reverting = useRef(false);
  const shown = draft ?? toText(value, definition.precision);

  const commit = (text: string) => {
    const parsed = parse(text);
    if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      aria-label={`${definition.label} value`}
      data-testid={`adjust-${definition.key}-input`}
      onFocus={(event) => {
        setDraft(toText(value, definition.precision));
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        if (reverting.current) {
          reverting.current = false;
          setDraft(null);
          return;
        }
        commit(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          reverting.current = true;
          setDraft(null);
          event.currentTarget.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const base = Number.isFinite(parse(shown)) ? parse(shown) : value;
          const delta = definition.step * (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
          const next = base + delta;
          onCommit(next);
          setDraft(null);
        }
      }}
      className={cn(
        'h-6 w-14 rounded-sm border border-line bg-surface-elevated px-1.5 text-right text-ui-sm text-fg tabular-nums outline-none',
        'hover:border-line-strong focus-visible:border-brand focus-visible:outline-1 focus-visible:outline-brand',
        className,
      )}
    />
  );
}
