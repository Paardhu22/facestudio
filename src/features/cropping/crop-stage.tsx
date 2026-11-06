'use client';

import type Konva from 'konva';
import { Check, Crop, Crosshair, Eye, Focus, Grid3X3, Maximize, Minus, Plus, ScanFace } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Path, Rect as KonvaRect, Stage, Text } from 'react-konva';

import { Button } from '@/components/ui/button';
import { useAdjustedPreview } from '@/features/adjustments';
import { useFaceDetection } from '@/features/face-detection';
import {
  commitRect,
  moveRect,
  rectBottom,
  rectRight,
  resizeRect,
  rectFromDrag,
  type ResizeHandle,
} from '@/lib/coordinates/rect';
import {
  centerView,
  fitView,
  fitRectView,
  focusCropView,
  imageToScreen,
  panBy,
  screenToImage,
  type ViewTransform,
  zoomAt,
} from '@/lib/coordinates/view';
import { FREE_ASPECT, resolveAspect } from '@/lib/cropping/aspect';
import { cropShapePath } from '@/lib/cropping/shapes';
import { DEFAULT_FRAMING, MIN_CROP_SIDE, newCropId } from '@/lib/cropping/framing';
import { chipRect, cursorFor, handlePoints, hitTest, type HitTarget } from '@/lib/cropping/hit-test';
import { snapCropCenter } from '@/lib/cropping/snap';
import { DEFAULT_ADJUSTMENTS } from '@/lib/image-processing/adjustment-spec';
import { cn } from '@/lib/utils';
import { selectEdit, useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { CropRegion, ImageId, Point, Rect, Size } from '@/types/domain';

import { centerCrop, chooseFace, removeCrop } from './crop-actions';
import { useCropCamera } from './use-crop-camera';
import { useElementSize } from './use-element-size';
import { useOverlayTokens } from './use-design-tokens';

type Drag =
  | { kind: 'pan'; last: Point }
  | { kind: 'move'; start: Point; base: CropRegion }
  | { kind: 'resize'; handle: ResizeHandle; base: CropRegion }
  | { kind: 'draw'; origin: Point; startScreen: Point; base: CropRegion | null; started: boolean };

const DRAW_THRESHOLD_PX = 4;
const STAGE_PADDING_PX = 32;
const ZOOM_STEP = 1.25;
const NUDGE = 1;
const NUDGE_FAST = 10;

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function dragLabel(kind: Drag['kind']): string {
  return kind === 'move' ? 'Move crop' : kind === 'resize' ? 'Resize crop' : 'Draw crop';
}

/**
 * The editing canvas (SKILLS.md §E-5, §E-6): the open image with live adjustments, the crop overlay, and face boxes.
 * Konva only RENDERS. All interaction is DOM pointer events decided by the pure, tested `hitTest`, in image coordinates, so
 * crops are exact at any zoom. Everything is stored in oriented original pixels (ADR-007).
 */
export default function CropStage({ id }: { id: ImageId }) {
  const image = useLibraryStore((s) => s.images[id]);
  const edit = useEditStore(selectEdit(id));
  const comparing = useEditStore((s) => s.comparing);
  const gestureOpen = useEditStore((s) => s.gesture?.id === id);
  const detection = useFaceDetection(id);
  const tokens = useOverlayTokens();

  const preview = useAdjustedPreview(id, comparing ? DEFAULT_ADJUSTMENTS : edit.adjustments);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(containerRef);

  const imageWidth = image?.width;
  const imageHeight = image?.height;
  const imageSize = useMemo<Size | null>(
    () => (imageWidth !== undefined && imageHeight !== undefined ? { width: imageWidth, height: imageHeight } : null),
    [imageWidth, imageHeight],
  );
  const fit = useMemo<ViewTransform>(
    () => (imageSize && viewport.width > 0 ? fitView(imageSize, viewport, STAGE_PADDING_PX) : { scale: 1, x: 0, y: 0 }),
    [imageSize, viewport],
  );
  const { view: editingView, settling, setView, animateTo, stop: stopCamera, reset: resetCamera } = useCropCamera(fit);
  const [autoZoom, setAutoZoom] = useState(true);
  const framed = useRef<string | null>(null);
  const [cleanPreview, setCleanPreview] = useState<string | null>(null);
  const previewing = edit.crop !== null && cleanPreview === edit.crop.id && !comparing;
  const view =
    previewing && edit.crop
      ? panBy(fitRectView(edit.crop.rect, { ...viewport, height: Math.max(1, viewport.height - 48) }), 0, 48)
      : comparing
        ? fit
        : editingView;

  const viewRef = useRef(view);
  const [activeDrag, setActiveDrag] = useState<Drag['kind'] | null>(null);
  const dragging = activeDrag !== null;
  const [showFaces, setShowFaces] = useState(true);
  const [guides, setGuides] = useState(false);
  const [hover, setHover] = useState<HitTarget>({ type: 'none' });
  const [snapped, setSnapped] = useState({ x: false, y: false });
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const imageNodeRef = useRef<Konva.Image | null>(null);

  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Wait for a committed crop: the camera must never chase the handles during a gesture.
  useEffect(() => {
    if (!viewport.width || !viewport.height || gestureOpen || dragging || previewing || comparing) return;
    const rect = edit.crop?.rect;
    const key = `${viewport.width},${viewport.height}:${rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : 'full'}`;
    if (key === framed.current) return;
    const previouslyFramed = framed.current !== null;
    framed.current = key;
    if (!autoZoom) return;
    if (rect) animateTo(focusCropView(rect, viewport));
    else if (previouslyFramed) animateTo(fit);
  }, [edit.crop, viewport, gestureOpen, dragging, previewing, comparing, autoZoom, animateTo, fit]);

  useEffect(() => {
    if (previewing || comparing) stopCamera();
  }, [previewing, comparing, stopCamera]);

  // Point the image node at the off-screen canvas and redraw whenever the worker produced new pixels.
  useEffect(() => {
    const node = imageNodeRef.current;
    const canvas = preview.canvasRef.current;
    if (!node || !canvas) return;
    node.image(canvas);
    node.getLayer()?.batchDraw();
  }, [preview.version, preview.canvasRef]);

  const crop = comparing ? null : edit.crop;
  const faces = useMemo(() => detection.result?.faces ?? [], [detection.result]);
  const faceBoxes = useMemo(
    () => (showFaces ? faces.map((face) => ({ id: face.id, box: face.box })) : []),
    [faces, showFaces],
  );

  const worldPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return screenToImage(viewRef.current, {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  }, []);

  const liveCrop = (next: CropRegion) => useEditStore.getState().setCropLive(id, next);
  const currentCrop = () => useEditStore.getState().edits[id]?.crop ?? null;

  const targetAt = useCallback(
    (point: Point): HitTarget =>
      hitTest(point, viewRef.current.scale, currentCrop()?.rect ?? null, faceBoxes, currentCrop()?.shape),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the latest crop from the store at call time
    [faceBoxes, id],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!imageSize || comparing || previewing) return;
    stopCamera();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 1 || spaceRef.current) {
      event.preventDefault();
      dragRef.current = { kind: 'pan', last: { x: event.clientX, y: event.clientY } };
      event.currentTarget.style.cursor = 'grabbing';
      setActiveDrag('pan');
      return;
    }

    const point = worldPoint(event);
    const base = currentCrop();
    const target = targetAt(point);
    if (target.type === 'chip') {
      chooseFace(id, target.faceId);
      return;
    }
    if (target.type === 'handle' && base) dragRef.current = { kind: 'resize', handle: target.handle, base };
    else if (target.type === 'move' && base) dragRef.current = { kind: 'move', start: point, base };
    else
      dragRef.current = {
        kind: 'draw',
        origin: point,
        startScreen: { x: event.clientX, y: event.clientY },
        base,
        started: false,
      };
    setHover(target);
    setActiveDrag(dragRef.current.kind);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!imageSize || previewing) return;

    if (!drag) {
      const target = targetAt(worldPoint(event));
      setHover((old) => (JSON.stringify(old) === JSON.stringify(target) ? old : target));
      event.currentTarget.style.cursor = comparing ? 'default' : cursorFor(target, spaceRef.current);
      return;
    }

    if (drag.kind === 'pan') {
      setView(panBy(viewRef.current, event.clientX - drag.last.x, event.clientY - drag.last.y));
      drag.last = { x: event.clientX, y: event.clientY };
      return;
    }

    const point = worldPoint(event);
    if (drag.kind === 'move') {
      const moved = moveRect(drag.base.rect, point.x - drag.start.x, point.y - drag.start.y, imageSize);
      const snap = event.altKey
        ? { rect: moved, x: false, y: false }
        : snapCropCenter(moved, imageSize, viewRef.current.scale);
      setSnapped({ x: snap.x, y: snap.y });
      liveCrop({
        ...drag.base,
        rect: { ...snap.rect, x: Math.round(snap.rect.x), y: Math.round(snap.rect.y) },
        manual: true,
        constrained: false,
      });
      return;
    }

    const ratio =
      drag.kind === 'resize' || drag.base
        ? resolveAspect((drag.base ?? { aspect: FREE_ASPECT }).aspect, imageSize)
        : null;
    const options = { aspect: ratio, minSide: MIN_CROP_SIDE };

    if (drag.kind === 'resize') {
      const rect = commitRect(resizeRect(drag.base.rect, drag.handle, point, imageSize, options), imageSize, options);
      liveCrop({ ...drag.base, rect, manual: true, constrained: false });
      return;
    }

    // draw: only after the pointer has really moved, so a plain click does not create a sliver
    if (!drag.started) {
      if (Math.hypot(event.clientX - drag.startScreen.x, event.clientY - drag.startScreen.y) < DRAW_THRESHOLD_PX)
        return;
      drag.started = true;
    }
    const rect = commitRect(rectFromDrag(drag.origin, point, imageSize, options), imageSize, options);
    const drawn: CropRegion = drag.base
      ? { ...drag.base, mode: 'custom', faceId: null, rect, manual: true, constrained: false }
      : {
          id: newCropId(),
          mode: 'custom',
          rect,
          aspect: FREE_ASPECT,
          faceId: null,
          framing: DEFAULT_FRAMING,
          manual: true,
          constrained: false,
          label: null,
        };
    liveCrop(drawn);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setActiveDrag(null);
    setSnapped({ x: false, y: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.kind !== 'pan') useEditStore.getState().commitGesture(dragLabel(drag.kind));
    event.currentTarget.style.cursor = cursorFor(targetAt(worldPoint(event)), spaceRef.current);
  };

  // Wheel zoom at the cursor. A native listener, because React's wheel handler is passive and cannot stop the page scrolling.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (previewing || dragRef.current) return;
      const box = element.getBoundingClientRect();
      const anchor = { x: event.clientX - box.left, y: event.clientY - box.top };
      setView(zoomAt(viewRef.current, Math.exp(-event.deltaY * 0.0015), anchor));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [setView, previewing]);

  const zoomBy = useCallback(
    (factor: number) => setView(zoomAt(viewRef.current, factor, { x: viewport.width / 2, y: viewport.height / 2 })),
    [setView, viewport.width, viewport.height],
  );
  const showActualSize = useCallback(() => {
    if (!imageSize) return;
    setView(centerView(imageSize, viewport, 1));
  }, [imageSize, setView, viewport]);
  const showFit = useCallback(() => {
    setCleanPreview(null);
    resetCamera();
  }, [resetCamera]);
  const togglePreview = useCallback(() => {
    if (edit.crop && !comparing && !dragRef.current)
      setCleanPreview((value) => (value === edit.crop?.id ? null : (edit.crop?.id ?? null)));
  }, [edit.crop, comparing]);

  // Window-level shortcuts: F fits, 1 shows 100%, + and − zoom.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        if (
          event.repeat ||
          comparing ||
          (event.target instanceof Element &&
            event.target.closest('[role="dialog"], [role="alertdialog"], [role="listbox"]'))
        )
          return;
        event.preventDefault();
        if (previewing) {
          setCleanPreview(null);
          return;
        }
        stopCamera();
        const drag = dragRef.current;
        if (drag && drag.kind !== 'pan') useEditStore.getState().commitGesture(dragLabel(drag.kind));
        dragRef.current = null;
        setActiveDrag(null);
        setSnapped({ x: false, y: false });
        setHover({ type: 'none' });
        spaceRef.current = false;
        setSpaceHeld(false);
        if (containerRef.current) containerRef.current.style.cursor = '';
        removeCrop(id);
        return;
      }
      if (event.key === 'p' || event.key === 'P') {
        if (!event.repeat) togglePreview();
        return;
      }
      if (event.key === 'g' || event.key === 'G') {
        if (!event.repeat && !previewing && !comparing) setGuides((value) => !value);
        return;
      }
      if (dragRef.current) return;
      if (event.key === 'f' || event.key === 'F') {
        showFit();
        return;
      }
      if (previewing) return;
      if (event.key === '1') showActualSize();
      else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
      else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM_STEP);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFit, showActualSize, zoomBy, togglePreview, previewing, comparing, stopCamera, id]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || previewing) return;
    if (event.key === ' ' || event.key.startsWith('Arrow')) stopCamera();
    if (event.key === ' ') {
      event.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
      event.currentTarget.style.cursor = 'grab';
      return;
    }
    const base = currentCrop();
    if (!base || !imageSize || comparing || dragRef.current) return;
    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const delta: Point | null =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : event.key === 'ArrowDown'
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    event.preventDefault();
    const moved = moveRect(base.rect, delta.x, delta.y, imageSize);
    liveCrop({ ...base, rect: moved, manual: true, constrained: false });
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ') {
      spaceRef.current = false;
      setSpaceHeld(false);
      event.currentTarget.style.cursor = '';
    } else if (event.key.startsWith('Arrow')) {
      useEditStore.getState().commitGesture('Nudge crop'); // closes the step: one per key press, or per held key
    }
  };

  if (!image || !imageSize) return null;

  const scale = view.scale;
  const px = (screen: number) => screen / scale; // a length that stays constant on screen
  const frame: Rect | null = crop?.rect ?? null;
  const shape = crop?.shape ?? 'rectangle';
  const shapePath = frame ? cropShapePath(frame, shape) : '';
  const clipShape = () => [new Path2D(shapePath)] as [Path2D];
  const percent = Math.round(scale * 100);
  const frameScreen = frame ? imageToScreen(view, frame) : null;
  const action = previewing
    ? 'Crop preview'
    : spaceHeld
      ? 'Pan image'
      : dragging
        ? activeDrag === 'move'
          ? 'Moving crop'
          : activeDrag === 'resize'
            ? 'Resizing crop'
            : 'Drawing crop'
        : hover.type === 'handle'
          ? 'Drag to resize'
          : hover.type === 'move'
            ? 'Drag to reframe'
            : 'Drag to draw a crop';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        role="group"
        tabIndex={0}
        aria-label="Image canvas"
        aria-describedby="canvas-help"
        data-testid="crop-stage"
        data-image-width={image.width}
        data-image-height={image.height}
        data-view-scale={view.scale}
        data-view-x={view.x}
        data-view-y={view.y}
        data-phase={preview.phase}
        data-shape={shape}
        data-crop={frame ? `${frame.x},${frame.y},${frame.width},${frame.height}` : ''}
        data-dragging={dragging}
        data-previewing={previewing}
        data-settling={settling}
        data-auto-zoom={autoZoom}
        data-guides={guides}
        data-snap-x={snapped.x}
        data-snap-y={snapped.y}
        data-hover={hover.type === 'handle' ? hover.handle : hover.type}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (!dragRef.current) setHover({ type: 'none' });
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          spaceRef.current = false;
          setSpaceHeld(false);
        }}
        className={cn(
          'relative min-h-0 flex-1 touch-none overflow-hidden bg-surface-canvas outline-none',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
          spaceHeld && 'cursor-grab',
        )}
      >
        {viewport.width > 0 ? (
          <Stage
            width={viewport.width}
            height={viewport.height}
            x={view.x}
            y={view.y}
            scaleX={scale}
            scaleY={scale}
            listening={false}
          >
            <Layer listening={false} clipFunc={previewing && frame ? clipShape : undefined}>
              {preview.version > 0 ? (
                <KonvaImage
                  ref={imageNodeRef}
                  image={undefined}
                  x={0}
                  y={0}
                  width={image.width}
                  height={image.height}
                />
              ) : null}
            </Layer>
            <Layer listening={false}>
              {frame && !previewing ? (
                <>
                  <Path
                    data={`${cropShapePath({ x: 0, y: 0, width: image.width, height: image.height })} ${shapePath}`}
                    fill={tokens.scrim}
                    fillRule="evenodd"
                  />
                  {shape === 'circle' || shape === 'hexagon' ? (
                    <KonvaRect
                      {...frame}
                      stroke={tokens.crop}
                      opacity={0.3}
                      dash={[4, 4]}
                      strokeWidth={1}
                      strokeScaleEnabled={false}
                    />
                  ) : null}
                  {/* Frame: a dark outer stroke keeps it visible on bright images. */}
                  <Path data={shapePath} stroke="rgb(0 0 0 / 0.5)" strokeWidth={3} strokeScaleEnabled={false} />
                  <Path
                    data={shapePath}
                    stroke={dragging ? tokens.accent : tokens.crop}
                    strokeWidth={1.25}
                    strokeScaleEnabled={false}
                  />
                  {dragging || guides ? (
                    <Group clipFunc={clipShape}>
                      {[1, 2].map((i) => (
                        <Line
                          key={`v${i}`}
                          points={[
                            frame.x + (frame.width * i) / 3,
                            frame.y,
                            frame.x + (frame.width * i) / 3,
                            rectBottom(frame),
                          ]}
                          stroke={tokens.crop}
                          opacity={0.35}
                          strokeWidth={0.75}
                          strokeScaleEnabled={false}
                        />
                      ))}
                      {[1, 2].map((i) => (
                        <Line
                          key={`h${i}`}
                          points={[
                            frame.x,
                            frame.y + (frame.height * i) / 3,
                            rectRight(frame),
                            frame.y + (frame.height * i) / 3,
                          ]}
                          stroke={tokens.crop}
                          opacity={0.35}
                          strokeWidth={0.75}
                          strokeScaleEnabled={false}
                        />
                      ))}
                    </Group>
                  ) : null}
                </>
              ) : null}

              {showFaces && !comparing && !previewing
                ? faces.map((face, index) => {
                    const selected = crop?.faceId === face.id;
                    const color = selected ? tokens.faceSelected : tokens.face;
                    const chip = chipRect(face.box, scale);
                    return (
                      <Group key={face.id}>
                        <KonvaRect
                          {...face.box}
                          stroke={color}
                          strokeWidth={selected ? 2 : 1.5}
                          dash={selected ? undefined : [5, 4]}
                          strokeScaleEnabled={false}
                        />
                        <Group x={chip.x} y={chip.y} scaleX={1 / scale} scaleY={1 / scale}>
                          <KonvaRect width={62} height={18} fill={color} cornerRadius={2} />
                          <Text
                            x={5}
                            y={3}
                            text={`Face ${index + 1}`}
                            fontSize={11}
                            fontStyle="bold"
                            fill={tokens.app}
                          />
                        </Group>
                      </Group>
                    );
                  })
                : null}

              {frame && !previewing
                ? Object.entries(handlePoints(frame)).map(([handle, p]) => (
                    <KonvaRect
                      key={handle}
                      x={p.x - px(5)}
                      y={p.y - px(5)}
                      width={px(10)}
                      height={px(10)}
                      fill={hover.type === 'handle' && hover.handle === handle ? tokens.accent : tokens.crop}
                      cornerRadius={px(1)}
                      stroke={tokens.app}
                      strokeWidth={1}
                      strokeScaleEnabled={false}
                    />
                  ))
                : null}
              {snapped.x ? (
                <Line
                  points={[image.width / 2, 0, image.width / 2, image.height]}
                  stroke={tokens.accent}
                  strokeWidth={1}
                  dash={[4, 4]}
                  strokeScaleEnabled={false}
                />
              ) : null}
              {snapped.y ? (
                <Line
                  points={[0, image.height / 2, image.width, image.height / 2]}
                  stroke={tokens.accent}
                  strokeWidth={1}
                  dash={[4, 4]}
                  strokeScaleEnabled={false}
                />
              ) : null}
            </Layer>
          </Stage>
        ) : null}

        {frame && frameScreen && !comparing && !previewing ? (
          <div
            className="crop-measurement"
            data-active={dragging || previewing}
            data-testid="crop-measurement"
            style={{
              left: Math.max(90, Math.min(viewport.width - 90, frameScreen.x + (frame.width * scale) / 2)),
              top: Math.max(68, Math.min(viewport.height - 72, frameScreen.y + frame.height * scale + 18)),
            }}
          >
            {snapped.x || snapped.y ? <Check aria-hidden="true" /> : <Crop aria-hidden="true" />}
            <span>
              {frame.width} × {frame.height} <span className="text-fg-muted">px</span>
            </span>
            {snapped.x || snapped.y ? <span className="text-brand">Centered</span> : null}
          </div>
        ) : null}
        {preview.phase === 'error' ? (
          <p
            role="status"
            className="absolute top-3 left-3 rounded-md border border-line bg-surface-panel px-2 py-1 text-ui-sm text-warning"
          >
            Live adjustment preview is unavailable in this browser.
          </p>
        ) : null}
      </div>

      <p id="canvas-help" className="sr-only">
        Drag to draw a crop box, drag its handles to resize, drag inside to move. Arrow keys nudge the crop by one
        pixel, Shift by ten. Hold Space and drag to pan. Scroll to zoom. F fits the image, 1 shows actual size. G
        toggles guides. The view zooms to your crop after each edit; Auto zoom toggles this behavior. P previews the
        crop. Escape returns from preview, or removes the crop while editing; Undo restores it. Hold Alt while moving to
        bypass center snapping.
      </p>

      <div className="crop-context-bar" data-testid="crop-context-bar">
        <div className="crop-context-tools">
          <span className="crop-tool-label">
            <Crop aria-hidden="true" /> Compose
          </span>
          <Button
            variant={guides ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Composition guides"
            aria-pressed={guides}
            title="Composition guides (G)"
            disabled={previewing || comparing}
            onClick={() => setGuides((value) => !value)}
            data-testid="toggle-guides"
          >
            <Grid3X3 />
          </Button>
          <Button
            variant={autoZoom ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Auto zoom to crop"
            aria-pressed={autoZoom}
            title="Automatically zoom to the crop after editing"
            disabled={previewing || comparing}
            onClick={() => {
              stopCamera();
              framed.current = null;
              setAutoZoom((enabled) => !enabled);
            }}
            data-testid="toggle-auto-zoom"
          >
            <Focus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Center crop"
            title="Center crop in the image"
            disabled={!crop || previewing || comparing}
            onClick={() => centerCrop(id)}
            data-testid="center-crop"
          >
            <Crosshair />
          </Button>
          <span className="mx-1 h-4 border-l border-line" />
          <Button
            variant={previewing ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={previewing}
            title="Preview crop (P). Escape returns to editing."
            disabled={!edit.crop || comparing}
            onClick={togglePreview}
            data-testid="preview-crop"
          >
            <Eye />
            {previewing ? 'Back to edit' : 'Preview'}
          </Button>
        </div>
        <p className="crop-action-hint" key={action} data-testid="crop-action-hint">
          {action}
          <span>
            {previewing && frame
              ? `${frame.width} × ${frame.height} px · Esc to return`
              : activeDrag === 'move'
                ? 'Alt · no snapping'
                : dragging
                  ? 'Release to set crop'
                  : 'Space · pan'}
          </span>
        </p>
      </div>

      <div
        className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-md border border-line bg-surface-panel p-0.5 shadow-elev-1"
        data-testid="zoom-bar"
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          title="Zoom out (−)"
          disabled={previewing}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          data-testid="zoom-out"
        >
          <Minus />
        </Button>
        <span
          className="min-w-11 text-center text-ui-sm text-fg-secondary tabular-nums"
          data-testid="zoom-readout"
          aria-live="off"
        >
          {percent}%
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          title="Zoom in (+)"
          disabled={previewing}
          onClick={() => zoomBy(ZOOM_STEP)}
          data-testid="zoom-in"
        >
          <Plus />
        </Button>
        <Button variant="ghost" size="xs" title="Fit to screen (F)" onClick={showFit} data-testid="zoom-fit">
          <Maximize />
          Fit
        </Button>
        <Button
          disabled={previewing}
          variant="ghost"
          size="xs"
          title="Actual size (1)"
          onClick={showActualSize}
          data-testid="zoom-actual"
        >
          1:1
        </Button>
        {faces.length > 0 ? (
          <Button
            variant={showFaces ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={showFaces}
            disabled={previewing || comparing}
            title="Show or hide detected faces"
            onClick={() => setShowFaces((v) => !v)}
            data-testid="toggle-faces"
          >
            <ScanFace />
            Faces
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Re-exported for tests and the toolbar of other features.
export { imageToScreen };
