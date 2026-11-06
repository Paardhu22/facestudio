'use client';

import { Crop, FolderOpen, ImagePlus, Images, LockKeyhole, ScanFace } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import { useLibraryStore } from '@/stores/library-store';
import { CompareButton } from '@/features/adjustments';
import { CropStage } from '@/features/cropping';
import { useUploadActions } from '@/features/upload';
import type { ImageId } from '@/types/domain';

function StageMessage({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-lg border border-line bg-surface-elevated text-fg-muted [&_svg]:size-5"
      >
        {icon}
      </span>
      <p className="text-ui-lg font-medium text-fg">{title}</p>
      {children}
    </div>
  );
}

function OpenImage({ id }: { id: ImageId }) {
  const image = useLibraryStore((s) => s.images[id]);
  if (!image) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CropStage id={id} />
      <div className="flex min-h-10 items-center justify-between gap-3 border-t border-line-subtle px-3 py-1">
        <p className="min-w-0 truncate text-ui-sm text-fg-muted tabular-nums">
          {image.originalFilename} · {formatCount(image.width)} × {formatCount(image.height)} px
        </p>
        <CompareButton id={id} />
      </div>
    </div>
  );
}

/**
 * Center region. Shows the open image with its adjustments applied live, on the Konva stage with zoom, pan, and crop
 * overlays arrives in Phase 3 (SKILLS.md §E-5). The empty state carries the primary import actions so a new
 * visitor never has to hunt for them.
 */
export function CanvasStage() {
  const { openFilePicker, openFolderPicker } = useUploadActions();
  const loadState = useLibraryStore((s) => s.loadState);
  const imageCount = useLibraryStore((s) => s.order.length);
  const activeId = useLibraryStore((s) => s.activeId);

  let content: React.ReactNode;
  if (activeId) {
    content = <OpenImage key={activeId} id={activeId} />;
  } else if (loadState !== 'ready') {
    content = <div className="flex-1" />;
  } else if (imageCount === 0) {
    content = (
      <div className="canvas-empty-state">
        <div className="empty-photo-stack" aria-hidden="true">
          <div className="empty-photo-card">
            <Images />
          </div>
          <div className="empty-photo-card">
            <Crop />
          </div>
          <div className="empty-photo-card">
            <ScanFace />
          </div>
        </div>
        <p>Add photos to get started</p>
        <p className="canvas-empty-description">
          Every great batch starts with your photos. Drop them anywhere in this window, or choose what to bring in.
        </p>
        <div className="canvas-empty-actions">
          <Button onClick={openFilePicker} data-testid="canvas-add-images">
            <ImagePlus aria-hidden="true" />
            Add images
          </Button>
          <Button variant="secondary" onClick={openFolderPicker} data-testid="canvas-add-folder">
            <FolderOpen aria-hidden="true" />
            Add folder
          </Button>
        </div>
        <div className="canvas-empty-formats">
          <span>JPEG</span>
          <span>PNG</span>
          <span>WebP</span>
        </div>
        <p className="canvas-empty-hint">
          <LockKeyhole aria-hidden="true" />
          Non-destructive edits. Your originals stay untouched.
        </p>
      </div>
    );
  } else {
    content = (
      <StageMessage icon={<Images />} title="Select an image">
        <p className="max-w-72 text-ui leading-relaxed text-fg-muted">
          Click a thumbnail in the library to open it here.
        </p>
      </StageMessage>
    );
  }

  return (
    <section aria-labelledby="canvas-title" className="flex h-full flex-col bg-surface-canvas">
      <h2 id="canvas-title" className="sr-only">
        Canvas
      </h2>
      <div className="canvas-label-bar" aria-hidden="true">
        <span>
          <Crop /> Workspace
        </span>
        <span>{imageCount > 0 ? 'Preview' : 'Ready for your photos'}</span>
      </div>
      {content}
    </section>
  );
}
