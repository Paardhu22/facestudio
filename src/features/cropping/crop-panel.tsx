'use client';

import {
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  Crop,
  Hexagon,
  RectangleHorizontal,
  Square,
  LoaderCircle,
  ScanFace,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useFaceDetection } from '@/features/face-detection';
import { formatCount, pluralize } from '@/lib/format';
import {
  ASPECT_PRESETS,
  makeAspect,
  MAX_CUSTOM_RATIO,
  MIN_CUSTOM_RATIO,
  parseRatioText,
  PRESET_LABELS,
  resolveAspect,
} from '@/lib/cropping/aspect';
import { isFaceMode } from '@/lib/cropping/build';
import { DEFAULT_OUTPUT } from '@/lib/cropping/output';
import { CROP_SHAPES, isEqualSided, SHAPE_LABELS } from '@/lib/cropping/shapes';
import { exportFormat } from '@/lib/export/filenames';
import { FRAMING_LIMITS } from '@/lib/cropping/framing';
import { cn } from '@/lib/utils';
import { selectCrop, selectOutput, useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { AspectRatioPreset, CropMode, ImageId } from '@/types/domain';

import {
  applyCropTo,
  chooseAspect,
  chooseFace,
  chooseMode,
  chooseShape,
  removeCrop,
  setFramingLive,
  typeRect,
} from './crop-actions';
import { IntegerField } from './integer-field';
import { ParamSlider } from './param-slider';

const MODES: { mode: CropMode; label: string; help: string }[] = [
  { mode: 'portrait', label: 'Portrait', help: 'Headshot framing around the detected face' },
  { mode: 'face', label: 'Face', help: 'A tight crop around the detected face' },
  { mode: 'custom', label: 'Custom', help: 'Draw or type a crop frame' },
];

const percent = (value: number) => `${Math.round(value * 100)}%`;

function RatioIcon({ ratio, free }: { ratio: number; free: boolean }) {
  return (
    <span className="crop-ratio-icon" aria-hidden="true">
      <span data-free={free} style={{ width: Math.min(24, 18 * ratio), height: Math.min(18, 24 / ratio) }} />
    </span>
  );
}

function Chip({
  checked,
  disabled,
  title,
  onClick,
  testId,
  visual,
  className,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  testId: string;
  visual?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'h-6 rounded-sm border px-2 text-ui-sm outline-none transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
        checked
          ? 'border-brand bg-surface-panel text-fg'
          : 'border-line bg-surface-elevated text-fg-secondary hover:border-line-strong hover:text-fg',
        'disabled:cursor-not-allowed disabled:opacity-40',
        visual && 'crop-choice',
        className,
      )}
    >
      {children}
    </button>
  );
}

function DetectionStatus({ id }: { id: ImageId }) {
  const { result, availability, failed } = useFaceDetection(id);
  let text: React.ReactNode;
  if (availability === 'unavailable') text = 'Face detection unavailable';
  else if (result?.status === 'complete') text = pluralize(result.faces.length, 'face') + ' detected';
  else if (result?.status === 'no_face') text = 'No face detected';
  else if (failed) text = 'Face detection failed for this image';
  else
    text = (
      <>
        <LoaderCircle aria-hidden="true" className="size-3 animate-spin" /> Detecting faces…
      </>
    );
  return (
    <span className="flex items-center gap-1 text-ui-sm text-fg-muted" role="status" data-testid="detection-status">
      {text}
    </span>
  );
}

/**
 * Crop controls for the open image (SKILLS.md §E-6, §E-8): mode, aspect ratio, exact X/Y/W/H, framing, face choice, and
 * scope-labeled apply buttons. Everything edits the OPEN image; "Apply to…" copies its crop SETTINGS, re-framing face modes
 * from each image's own face and mapping custom boxes by normalized position.
 */
export function CropPanel({ id }: { id: ImageId }) {
  const image = useLibraryStore((s) => s.images[id]);
  const crop = useEditStore(selectCrop(id));
  const output = useEditStore(selectOutput(id)) ?? DEFAULT_OUTPUT;
  const { result, availability } = useFaceDetection(id);
  const selection = useLibraryStore((s) => s.selection);
  const imageCount = useLibraryStore((s) => s.order.length);
  const [note, setNote] = useState<{ id: ImageId; text: string } | null>(null);
  const [ratioDraft, setRatioDraft] = useState<{ id: ImageId; text: string } | null>(null);

  if (!image) return null;

  const shape = crop?.shape ?? 'rectangle';
  const lockedAspect = isEqualSided(shape);
  const transparentShape = shape === 'circle' || shape === 'hexagon';
  const shapeIcons = { rectangle: RectangleHorizontal, square: Square, circle: Circle, hexagon: Hexagon };
  const faces = result?.faces ?? [];
  const faceModesReady = faces.length > 0;
  const faceModeReason =
    availability === 'unavailable'
      ? 'Face detection is unavailable, so face crops cannot be made'
      : result === undefined
        ? 'Faces are still being detected for this image'
        : 'No face was found in this image';

  const faceIndex = crop?.faceId ? faces.findIndex((face) => face.id === crop.faceId) : -1;
  const stepFace = (delta: number) => {
    const next = faces[(faceIndex + delta + faces.length) % faces.length];
    if (next) chooseFace(id, next.id);
  };

  const selectedIds = Array.from(selection);
  const othersSelected = selectedIds.filter((s) => s !== id).length;
  const showNote = note?.id === id ? note.text : null;

  const apply = (ids: readonly ImageId[], label: string) => {
    const r = applyCropTo(id, ids, label);
    const parts = [`Applied to ${pluralize(r.applied, 'image')}`];
    if (r.skippedNoFace > 0) parts.push(`${formatCount(r.skippedNoFace)} skipped (no face found)`);
    if (r.skippedNotDetected > 0) parts.push(`${formatCount(r.skippedNotDetected)} skipped (faces not detected yet)`);
    setNote({ id, text: parts.join(' · ') });
  };

  const ratioText =
    ratioDraft?.id === id ? ratioDraft.text : crop?.aspect.value ? String(Number(crop.aspect.value.toFixed(3))) : '';
  const commitRatio = () => {
    if (ratioDraft?.id !== id) return;
    const ratio = parseRatioText(ratioDraft.text);
    if (ratio !== null) chooseAspect(id, makeAspect('custom', ratio));
    setRatioDraft(null);
  };

  const pickPreset = (preset: AspectRatioPreset) => {
    if (preset === 'custom') {
      const ratio = crop ? crop.rect.width / crop.rect.height : 1;
      chooseAspect(id, makeAspect('custom', Math.min(MAX_CUSTOM_RATIO, Math.max(MIN_CUSTOM_RATIO, ratio))));
    } else chooseAspect(id, makeAspect(preset));
  };

  return (
    <section aria-label="Crop" className="crop-controls border-b border-line-subtle px-3 py-3" data-testid="crop-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-ui-xs font-medium tracking-wider text-fg-muted uppercase">Crop</h3>
        <DetectionStatus id={id} />
      </div>

      <div role="radiogroup" aria-label="Crop mode" className="grid grid-cols-3 gap-1" data-testid="crop-modes">
        {MODES.map(({ mode, label, help }) => {
          const needsFace = isFaceMode(mode);
          const disabled = needsFace && !faceModesReady;
          return (
            <Chip
              key={mode}
              checked={crop?.mode === mode}
              disabled={disabled}
              title={disabled ? faceModeReason : help}
              testId={`crop-mode-${mode}`}
              onClick={() => chooseMode(id, mode)}
              visual
            >
              {mode === 'portrait' ? (
                <UserRound aria-hidden="true" />
              ) : mode === 'face' ? (
                <ScanFace aria-hidden="true" />
              ) : (
                <Crop aria-hidden="true" />
              )}
              {label}
            </Chip>
          );
        })}
      </div>

      <div className="mt-3">
        <p id="shape-label" className="mb-1 text-ui-sm text-fg-muted">
          Shape
        </p>
        <div
          role="radiogroup"
          aria-labelledby="shape-label"
          className="crop-shapes-grid grid gap-1"
          data-testid="crop-shapes"
        >
          {CROP_SHAPES.map((value) => {
            const Icon = shapeIcons[value];
            return (
              <Chip
                key={value}
                checked={shape === value}
                testId={`crop-shape-${value}`}
                className="crop-shape-choice"
                title={`Crop as a ${SHAPE_LABELS[value].toLowerCase()}`}
                onClick={() => chooseShape(id, value)}
                visual
              >
                <Icon aria-hidden="true" />
                {SHAPE_LABELS[value]}
              </Chip>
            );
          })}
        </div>
        {crop ? (
          <p className="mt-2 text-ui-xs leading-relaxed text-fg-muted" data-testid="shape-help">
            {lockedAspect
              ? 'Equal sides stay locked. Drag the frame to resize or move it.'
              : 'Drag the frame to resize or move it. Use aspect ratios to change its proportions.'}
          </p>
        ) : null}
        {crop && transparentShape ? (
          <div
            className="mt-2 rounded-md border border-line-subtle p-2 text-ui-xs leading-relaxed text-fg-muted"
            data-testid="shape-transparency"
          >
            PNG and WebP keep transparent corners. JPEG fills them with the output background.
            {exportFormat(image, output) === 'jpeg' ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full"
                data-testid="shape-use-png"
                onClick={() =>
                  useEditStore.getState().setOutput(id, { ...output, format: 'png' }, 'Transparent PNG output')
                }
              >
                Use PNG for transparency
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <p id="aspect-label" className="mb-1 text-ui-sm text-fg-muted">
          Aspect ratio
        </p>
        <div
          role="radiogroup"
          aria-labelledby="aspect-label"
          className="grid grid-cols-3 gap-1"
          data-testid="crop-aspects"
        >
          {ASPECT_PRESETS.map((preset) => (
            <Chip
              key={preset}
              checked={crop?.aspect.preset === preset}
              disabled={(lockedAspect && preset !== '1:1') || (preset === 'free' && crop?.mode === 'portrait')}
              title={
                lockedAspect && preset !== '1:1'
                  ? `${SHAPE_LABELS[shape]} crops keep equal sides`
                  : preset === 'free' && crop?.mode === 'portrait'
                    ? 'Headshots need a fixed ratio'
                    : undefined
              }
              testId={`aspect-${preset.replace(':', '-')}`}
              onClick={() => pickPreset(preset)}
              visual
            >
              <RatioIcon
                ratio={resolveAspect(makeAspect(preset, crop?.aspect.value ?? 1), image) ?? 1.3}
                free={preset === 'free'}
              />
              {PRESET_LABELS[preset]}
            </Chip>
          ))}
        </div>
        {crop?.aspect.preset === 'custom' ? (
          <label className="mt-2 flex items-center gap-2 text-ui-sm text-fg-muted">
            Ratio (W:H)
            <input
              type="text"
              value={ratioText}
              placeholder="5:7"
              aria-label="Custom aspect ratio"
              data-testid="custom-ratio"
              onChange={(event) => setRatioDraft({ id, text: event.target.value })}
              onBlur={commitRatio}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRatio();
                if (event.key === 'Escape') setRatioDraft(null);
              }}
              className="h-6 w-24 rounded-sm border border-line bg-surface-elevated px-1.5 text-ui-sm text-fg outline-none focus-visible:border-brand"
            />
          </label>
        ) : null}
      </div>

      {crop ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="crop-rect-fields">
            <IntegerField
              label="X"
              suffix="px"
              testId="crop-x"
              value={crop.rect.x}
              min={0}
              max={image.width - crop.rect.width}
              onCommit={(x) => typeRect(id, { x })}
            />
            <IntegerField
              label="Y"
              suffix="px"
              testId="crop-y"
              value={crop.rect.y}
              min={0}
              max={image.height - crop.rect.height}
              onCommit={(y) => typeRect(id, { y })}
            />
            <IntegerField
              label="W"
              suffix="px"
              testId="crop-w"
              value={crop.rect.width}
              min={1}
              max={image.width}
              onCommit={(width) => typeRect(id, { width })}
            />
            <IntegerField
              label="H"
              suffix="px"
              testId="crop-h"
              value={crop.rect.height}
              min={1}
              max={image.height}
              onCommit={(height) => typeRect(id, { height })}
            />
          </div>
          <p className="mt-1 text-ui-sm text-fg-muted tabular-nums">
            of {formatCount(image.width)} × {formatCount(image.height)} px
          </p>

          {isFaceMode(crop.mode) ? (
            <div className="mt-3 flex flex-col gap-2" data-testid="framing-controls">
              {crop.mode === 'portrait' ? (
                <>
                  <ParamSlider
                    label="Face size"
                    testId="framing-faceFill"
                    value={crop.framing.faceFill}
                    {...FRAMING_LIMITS.faceFill}
                    format={percent}
                    onLive={(faceFill) => setFramingLive(id, { faceFill })}
                    onCommit={() => useEditStore.getState().commitGesture('Face size')}
                  />
                  <ParamSlider
                    label="Headroom"
                    testId="framing-headroom"
                    value={crop.framing.headroom}
                    {...FRAMING_LIMITS.headroom}
                    format={percent}
                    onLive={(headroom) => setFramingLive(id, { headroom })}
                    onCommit={() => useEditStore.getState().commitGesture('Headroom')}
                  />
                </>
              ) : (
                <ParamSlider
                  label="Padding"
                  testId="framing-padding"
                  value={crop.framing.padding}
                  {...FRAMING_LIMITS.padding}
                  format={percent}
                  onLive={(padding) => setFramingLive(id, { padding })}
                  onCommit={() => useEditStore.getState().commitGesture('Padding')}
                />
              )}
              {faces.length > 1 ? (
                <div
                  className="flex items-center justify-between rounded-sm border border-line bg-surface-elevated px-1 py-0.5"
                  data-testid="face-picker"
                >
                  <Button variant="ghost" size="icon-xs" aria-label="Previous face" onClick={() => stepFace(-1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="text-ui-sm text-fg tabular-nums" data-testid="face-picker-label">
                    Face {faceIndex + 1} of {faces.length}
                  </span>
                  <Button variant="ghost" size="icon-xs" aria-label="Next face" onClick={() => stepFace(1)}>
                    <ChevronRight />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {crop.constrained ? (
            <p className="mt-2 flex items-start gap-1.5 text-ui-sm text-warning" data-testid="crop-constrained">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Framing was adjusted to stay inside the image.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-ui-sm text-fg-muted" data-testid="crop-hint">
          No crop yet: the whole image is exported. Choose a mode or a ratio, or drag on the image to draw a box.
        </p>
      )}

      <div className="mt-4 grid gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={!crop || othersSelected === 0}
          onClick={() => apply(selectedIds, 'Apply crop to selected')}
          data-testid="crop-apply-selected"
          title={
            !crop
              ? 'Make a crop first'
              : othersSelected === 0
                ? 'Select other images (Ctrl+click) to copy this crop setup to them'
                : undefined
          }
        >
          Apply crop to selected ({formatCount(selectedIds.length)})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!crop || imageCount < 2}
          onClick={() => apply(useLibraryStore.getState().order, 'Apply crop to all')}
          data-testid="crop-apply-all"
          title={!crop ? 'Make a crop first' : undefined}
        >
          Apply crop to all ({formatCount(imageCount)})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!crop}
          onClick={() => removeCrop(id)}
          data-testid="crop-remove"
          title="Remove crop (Esc while editing)"
        >
          Remove crop
        </Button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-ui-sm text-fg-muted" data-testid="crop-note">
        {showNote}
      </p>
    </section>
  );
}
