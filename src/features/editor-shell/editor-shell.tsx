'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { type Layout, type LayoutChangedMeta, Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';

import { useEditorShortcuts, useEditSync } from '@/features/adjustments';
import { CanvasStage } from '@/features/canvas';
import { useBackgroundDetection } from '@/features/face-detection';
import { LibraryPanel, useLibraryBootstrap } from '@/features/image-library';
import { UploadProvider } from '@/features/upload';
import { TooltipProvider } from '@/components/ui/tooltip';
import { safeLocalStorage } from '@/lib/safe-storage';
import { cn } from '@/lib/utils';

import { ControlsPanel } from './editor-regions';
import { EditorToolbar } from './editor-toolbar';
import { PANEL_SIZES, PANEL_SIZES_STORAGE_KEY, parseSidePanelSizes, serializeSidePanelSizes } from './panel-sizes';
import { SmallScreenNotice } from './small-screen-notice';
import { StatusBar } from './status-bar';

function ResizeHandle({ label }: { label: string }) {
  return (
    <Separator
      aria-label={label}
      className={cn(
        'relative w-px bg-line outline-none transition-colors duration-[120ms]',
        // Wider invisible hit area for pointer users.
        'after:absolute after:inset-y-0 after:-left-1 after:w-[9px] after:content-[""]',
        'data-[separator=hover]:bg-line-strong data-[separator=active]:bg-brand data-[separator=focus]:bg-brand',
      )}
    />
  );
}

/**
 * Resizable three-panel body. The server and client render the same tree (default px sizes);
 * saved side-panel widths are applied imperatively before first paint, so nothing remounts and
 * hydration never reads storage.
 */
function ResizablePanels() {
  const libraryRef = usePanelRef();
  const controlsRef = usePanelRef();
  const groupElementRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const saved = parseSidePanelSizes(safeLocalStorage.getItem(PANEL_SIZES_STORAGE_KEY));
    if (!saved) return;
    libraryRef.current?.resize(saved.library);
    controlsRef.current?.resize(saved.controls);
  }, [libraryRef, controlsRef]);

  // Pixels are derived from the validated layout (percentages) and the group's width: inside this
  // callback `panel.getSize()` still reports the pre-change DOM size.
  const handleLayoutChanged = useCallback((layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return;
    const groupWidth = groupElementRef.current?.offsetWidth;
    const libraryPct = layout.library;
    const controlsPct = layout.controls;
    if (!groupWidth || libraryPct === undefined || controlsPct === undefined) return;
    safeLocalStorage.setItem(
      PANEL_SIZES_STORAGE_KEY,
      serializeSidePanelSizes({ library: (libraryPct / 100) * groupWidth, controls: (controlsPct / 100) * groupWidth }),
    );
  }, []);

  return (
    <Group
      id="editor-panels"
      orientation="horizontal"
      elementRef={groupElementRef}
      onLayoutChanged={handleLayoutChanged}
      className="min-h-0 flex-1"
    >
      <Panel
        id="library"
        panelRef={libraryRef}
        defaultSize={PANEL_SIZES.library.default}
        minSize={PANEL_SIZES.library.min}
        maxSize={PANEL_SIZES.library.max}
      >
        <LibraryPanel />
      </Panel>
      <ResizeHandle label="Resize library panel" />
      <Panel id="canvas" minSize={PANEL_SIZES.canvas.min}>
        <CanvasStage />
      </Panel>
      <ResizeHandle label="Resize controls panel" />
      <Panel
        id="controls"
        panelRef={controlsRef}
        defaultSize={PANEL_SIZES.controls.default}
        minSize={PANEL_SIZES.controls.min}
        maxSize={PANEL_SIZES.controls.max}
      >
        <ControlsPanel />
      </Panel>
    </Group>
  );
}

export function EditorShell() {
  useLibraryBootstrap();
  useEditSync();
  useBackgroundDetection();
  useEditorShortcuts();

  return (
    <TooltipProvider>
      <UploadProvider>
        <div className="editor-workspace hidden h-dvh flex-col overflow-hidden lg:flex" data-testid="editor-shell">
          <h1 className="sr-only">FaceStudio editor</h1>
          <EditorToolbar batchName="Untitled batch" />
          <main id="main" className="flex min-h-0 flex-1">
            <ResizablePanels />
          </main>
          <StatusBar />
        </div>
        <SmallScreenNotice className="lg:hidden" />
      </UploadProvider>
    </TooltipProvider>
  );
}
