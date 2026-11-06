'use client';

import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type IntegerFieldProps = {
  label: string;
  testId: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
  className?: string;
};

const parse = (text: string): number => Number(text.replace('−', '-').replace(',', '.').trim());

/**
 * A whole-number input for pixel values (SKILLS.md §B.10): ↑/↓ step by 1, Shift+↑/↓ by 10, Enter commits, Escape reverts
 * without committing, blur commits. Unparseable text reverts. The caller clamps to what is valid for the image.
 */
export function IntegerField({
  label,
  testId,
  value,
  min,
  max,
  suffix,
  disabled,
  onCommit,
  className,
}: IntegerFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const reverting = useRef(false); // Escape blurs the field, and blur would otherwise re-read and commit the typed text
  const shown = draft ?? String(Math.round(value));

  const clampValue = (n: number) => Math.round(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
  const commit = (text: string) => {
    const parsed = parse(text);
    if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(clampValue(parsed));
    setDraft(null);
  };

  return (
    <label className={cn('flex items-center gap-1.5', className)}>
      <span className="w-3 text-ui-sm text-fg-muted">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        disabled={disabled}
        aria-label={`${label}${suffix ? ` (${suffix})` : ''}`}
        data-testid={testId}
        onFocus={(event) => {
          setDraft(String(Math.round(value)));
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
            onCommit(clampValue(base + (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1)));
            setDraft(null);
          }
        }}
        className={cn(
          'h-6 w-full min-w-0 rounded-sm border border-line bg-surface-elevated px-1.5 text-right text-ui-sm text-fg tabular-nums outline-none',
          'hover:border-line-strong focus-visible:border-brand focus-visible:outline-1 focus-visible:outline-brand disabled:opacity-50',
        )}
      />
    </label>
  );
}
