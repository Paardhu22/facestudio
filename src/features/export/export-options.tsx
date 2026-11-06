'use client';

import { cn } from '@/lib/utils';
import type { EditScope, OutputFormat } from '@/types/domain';

export type ExportOptionsValue = {
  scope: EditScope;
  format: OutputFormat | 'individual';
  preserveFolders: boolean;
  filenameTemplate: string;
};

export function ExportOptions({
  value,
  onChange,
  counts,
}: {
  value: ExportOptionsValue;
  onChange: (value: ExportOptionsValue) => void;
  counts: Record<EditScope, number>;
}) {
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-ui font-medium">Images to export</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { scope: 'current', label: 'Current image' },
              { scope: 'selected', label: 'Selected' },
              { scope: 'all', label: 'All images' },
            ] as const
          ).map((item) => (
            <label
              key={item.scope}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border p-3 text-ui transition-colors focus-within:outline-2 focus-within:outline-brand',
                value.scope === item.scope
                  ? 'border-brand bg-surface-panel'
                  : 'border-line bg-surface-elevated hover:border-line-strong',
                counts[item.scope] === 0 && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name="export-scope"
                value={item.scope}
                checked={value.scope === item.scope}
                disabled={counts[item.scope] === 0}
                onChange={() => onChange({ ...value, scope: item.scope })}
                className="accent-[var(--fs-accent)]"
              />
              <span>
                {item.label}
                <span className="mt-1 block text-ui-xs text-fg-muted tabular-nums">
                  {counts[item.scope]} {counts[item.scope] === 1 ? 'photo' : 'photos'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="export-format" className="mb-2 block text-ui font-medium">
          File format
        </label>
        <select
          id="export-format"
          value={value.format}
          onChange={(e) => onChange({ ...value, format: e.target.value as ExportOptionsValue['format'] })}
          className="h-9 w-full rounded-md border border-line bg-surface-elevated px-3 text-ui outline-none focus-visible:outline-2 focus-visible:outline-brand"
        >
          <option value="individual">Use each image’s output settings</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
          <option value="source">Same format as original</option>
        </select>
      </div>
      <div>
        <label htmlFor="export-filename" className="mb-2 block text-ui font-medium">
          File naming <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <input
          id="export-filename"
          value={value.filenameTemplate}
          onChange={(e) => onChange({ ...value, filenameTemplate: e.target.value })}
          maxLength={200}
          placeholder="Keep original names"
          className="h-9 w-full rounded-md border border-line bg-surface-elevated px-3 text-ui outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-brand"
        />
        <p className="mt-2 text-ui-sm text-fg-muted">
          Available: {'{name} {n} {w} {h} {mode}'}. Duplicate names get a number.
        </p>
      </div>
      <label className="flex items-center gap-2 text-ui text-fg-secondary">
        <input
          type="checkbox"
          checked={value.preserveFolders}
          onChange={(e) => onChange({ ...value, preserveFolders: e.target.checked })}
          className="accent-[var(--fs-accent)]"
        />
        Keep folder structure
      </label>
      <p className="rounded-md border border-line-subtle bg-surface-canvas p-3 text-ui leading-relaxed text-fg-muted">
        Exports use your full-resolution originals with each photo’s crop, adjustments, and sizing. The download is a
        ZIP. Your source files stay untouched.
      </p>
    </div>
  );
}
