'use client';

import { CircleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import { computeOutputSize, DEFAULT_OUTPUT, FIT_HELP, FIT_LABELS, FIT_STRATEGIES } from '@/lib/cropping/output';
import { cn } from '@/lib/utils';
import { selectCrop, selectOutput, useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { FitStrategy, ImageId, OutputFormat, OutputSettings, ResizeSpec } from '@/types/domain';

import { IntegerField } from './integer-field';
import { ParamSlider } from './param-slider';

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'source', label: 'Same as source' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

type ResizeMode = ResizeSpec['mode'];
const SIZE_MODES: { value: ResizeMode; label: string }[] = [
  { value: 'none', label: 'Original size' },
  { value: 'exact', label: 'Exact size' },
  { value: 'longEdge', label: 'Long edge' },
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
];

const selectClass =
  'h-7 w-full rounded-sm border border-line bg-surface-elevated px-1.5 text-ui text-fg outline-none hover:border-line-strong focus-visible:border-brand focus-visible:outline-1 focus-visible:outline-brand';

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-ui-sm text-fg-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Output settings for the open image (SKILLS.md §E-9): format, quality, and how the (cropped) image is sized. Cropping,
 * resizing, padding, and stretching are separate, explicit choices; stretching is flagged because it distorts faces.
 * These are saved as instructions today and applied by the export in Phase 6; the readout shows the exact result size now.
 */
export function OutputPanel({ id }: { id: ImageId }) {
  const image = useLibraryStore((s) => s.images[id]);
  const limits = useLibraryStore((s) => s.limits);
  const crop = useEditStore(selectCrop(id));
  const stored = useEditStore(selectOutput(id));
  const selection = useLibraryStore((s) => s.selection);
  const imageCount = useLibraryStore((s) => s.order.length);
  if (!image) return null;

  const output: OutputSettings = stored ?? DEFAULT_OUTPUT;
  const source = crop
    ? { width: crop.rect.width, height: crop.rect.height }
    : { width: image.width, height: image.height };
  const size = computeOutputSize(source, output, limits.maxOutputSide);
  const edit = (patch: Partial<OutputSettings>, label: string) =>
    useEditStore.getState().setOutput(id, { ...output, ...patch }, label);
  const setResize = (resize: ResizeSpec) => edit({ resize }, 'Output size');

  const changeMode = (mode: ResizeMode) => {
    const w = Math.min(limits.maxOutputSide, Math.round(size.width));
    const h = Math.min(limits.maxOutputSide, Math.round(size.height));
    const longEdge = Math.max(w, h);
    switch (mode) {
      case 'none':
        return setResize({ mode: 'none' });
      case 'exact':
        return setResize({ mode: 'exact', width: w, height: h, fit: 'inside' });
      case 'longEdge':
        return setResize({ mode: 'longEdge', size: longEdge });
      case 'width':
        return setResize({ mode: 'width', width: w });
      case 'height':
        return setResize({ mode: 'height', height: h });
    }
  };

  const selectedIds = Array.from(selection);
  const others = selectedIds.filter((s) => s !== id).length;
  const resize = output.resize;
  const usesPadColor = resize.mode === 'exact' && resize.fit === 'pad';
  const hasQuality = output.format !== 'png';

  return (
    <section aria-label="Output" className="border-b border-line-subtle px-3 py-3" data-testid="output-panel">
      <h3 className="mb-2 text-ui-xs font-medium tracking-wider text-fg-muted uppercase">Output</h3>

      <div className="flex flex-col gap-3">
        <Field label="Format" htmlFor="output-format">
          <select
            id="output-format"
            className={selectClass}
            value={output.format}
            data-testid="output-format"
            onChange={(e) => edit({ format: e.target.value as OutputFormat }, 'Output format')}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        {hasQuality ? (
          <ParamSlider
            label="Quality"
            testId="output-quality"
            value={output.quality}
            min={1}
            max={100}
            step={1}
            format={(v) => String(Math.round(v))}
            onLive={(quality) => useEditStore.getState().setOutputLive(id, { ...output, quality })}
            onCommit={() => useEditStore.getState().commitGesture('Output quality')}
          />
        ) : null}

        <Field label="Size" htmlFor="output-size-mode">
          <select
            id="output-size-mode"
            className={selectClass}
            value={resize.mode}
            data-testid="output-size-mode"
            onChange={(e) => changeMode(e.target.value as ResizeMode)}
          >
            {SIZE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        {resize.mode === 'exact' ? (
          <>
            <div className="grid grid-cols-2 gap-x-3">
              <IntegerField
                label="W"
                suffix="px"
                testId="output-width"
                value={resize.width}
                min={1}
                max={limits.maxOutputSide}
                onCommit={(width) => setResize({ ...resize, width })}
              />
              <IntegerField
                label="H"
                suffix="px"
                testId="output-height"
                value={resize.height}
                min={1}
                max={limits.maxOutputSide}
                onCommit={(height) => setResize({ ...resize, height })}
              />
            </div>
            <Field label="When the shape differs" htmlFor="output-fit">
              <select
                id="output-fit"
                className={selectClass}
                value={resize.fit}
                data-testid="output-fit"
                onChange={(e) => setResize({ ...resize, fit: e.target.value as FitStrategy })}
              >
                {FIT_STRATEGIES.map((fit) => (
                  <option key={fit} value={fit}>
                    {FIT_LABELS[fit]}
                  </option>
                ))}
              </select>
              <span
                className={cn('text-ui-sm', resize.fit === 'stretch' ? 'text-warning' : 'text-fg-muted')}
                data-testid="output-fit-help"
              >
                {FIT_HELP[resize.fit]}
              </span>
            </Field>
          </>
        ) : null}
        {resize.mode === 'longEdge' ? (
          <IntegerField
            label="px"
            testId="output-longedge"
            value={resize.size}
            min={1}
            max={limits.maxOutputSide}
            onCommit={(s) => setResize({ mode: 'longEdge', size: s })}
          />
        ) : null}
        {resize.mode === 'width' ? (
          <IntegerField
            label="W"
            suffix="px"
            testId="output-width-only"
            value={resize.width}
            min={1}
            max={limits.maxOutputSide}
            onCommit={(w) => setResize({ mode: 'width', width: w })}
          />
        ) : null}
        {resize.mode === 'height' ? (
          <IntegerField
            label="H"
            suffix="px"
            testId="output-height-only"
            value={resize.height}
            min={1}
            max={limits.maxOutputSide}
            onCommit={(h) => setResize({ mode: 'height', height: h })}
          />
        ) : null}

        {resize.mode !== 'none' ? (
          <label className="flex items-center gap-2 text-ui text-fg-secondary">
            <input
              type="checkbox"
              checked={output.allowUpscale}
              data-testid="output-upscale"
              onChange={(e) => edit({ allowUpscale: e.target.checked }, 'Allow upscaling')}
              className="size-3.5 accent-[var(--fs-accent)]"
            />
            Allow upscaling
          </label>
        ) : null}

        {usesPadColor ? (
          <label className="flex items-center gap-2 text-ui text-fg-secondary">
            Pad color
            <input
              type="color"
              value={output.padColor.toLowerCase()}
              data-testid="output-pad-color"
              aria-label="Pad color"
              onChange={(e) => edit({ padColor: e.target.value.toUpperCase() }, 'Pad color')}
              className="h-6 w-10 cursor-pointer rounded-sm border border-line bg-transparent"
            />
            <span className="text-ui-sm text-fg-muted tabular-nums">{output.padColor}</span>
          </label>
        ) : null}
      </div>

      <div className="mt-3 rounded-sm border border-line bg-surface-elevated px-2 py-1.5" data-testid="output-readout">
        <p className="text-ui text-fg tabular-nums">
          Output{' '}
          <span data-testid="output-size">
            {formatCount(size.width)} × {formatCount(size.height)}
          </span>{' '}
          px
        </p>
        <p className="text-ui-sm text-fg-muted tabular-nums">
          from {crop ? 'the crop' : 'the whole image'} ({formatCount(source.width)} × {formatCount(source.height)} px)
        </p>
        {size.upscaled ? (
          <p className="mt-1 flex items-center gap-1 text-ui-sm text-warning">
            <CircleAlert aria-hidden="true" className="size-3.5" />
            Enlarges pixels ({size.scale.toFixed(2)}×)
          </p>
        ) : null}
        {size.distorted ? (
          <p className="mt-1 flex items-center gap-1 text-ui-sm text-warning" data-testid="output-distorted">
            <CircleAlert aria-hidden="true" className="size-3.5" />
            Stretches the image out of proportion
          </p>
        ) : null}
        {size.limited ? (
          <p className="mt-1 flex items-center gap-1 text-ui-sm text-warning">
            <CircleAlert aria-hidden="true" className="size-3.5" />
            Reduced to the {formatCount(limits.maxOutputSide)} px maximum
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={others === 0}
          data-testid="output-apply-selected"
          onClick={() => useEditStore.getState().applyOutputTo(selectedIds, stored, 'Apply output to selected')}
          title={others === 0 ? 'Select other images (Ctrl+click) to copy these output settings to them' : undefined}
        >
          Apply output to selected ({formatCount(selectedIds.length)})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={imageCount < 2}
          data-testid="output-apply-all"
          onClick={() =>
            useEditStore.getState().applyOutputTo(useLibraryStore.getState().order, stored, 'Apply output to all')
          }
        >
          Apply output to all ({formatCount(imageCount)})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={stored === null}
          data-testid="output-reset"
          onClick={() => useEditStore.getState().setOutput(id, null, 'Reset output')}
        >
          Reset output
        </Button>
      </div>
    </section>
  );
}
