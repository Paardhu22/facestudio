'use client';

import { FolderPlus, ImagePlus, LoaderCircle, Images, SearchX, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { pluralize } from '@/lib/format';
import { useLibraryStore } from '@/stores/library-store';
import { useUploadActions } from '@/features/upload';

import { loadLibrary } from './load-library';
import { LibraryToolbar } from './library-toolbar';
import { ThumbnailGrid } from './thumbnail-grid';
import { UploadFailures } from './upload-failures';
import { useVisibleImageIds } from './use-visible-image-ids';

function Message({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span aria-hidden="true" className="text-fg-muted [&_svg]:size-6">
        {icon}
      </span>
      <p className="text-ui-lg font-medium text-fg">{title}</p>
      {children ? <div className="text-ui leading-relaxed text-fg-muted">{children}</div> : null}
    </div>
  );
}

/** Left panel: add images, search, selection, and the virtualized thumbnail grid (SKILLS.md §B.11, §E-4). */
export function LibraryPanel() {
  const { openFilePicker, openFolderPicker } = useUploadActions();
  const loadState = useLibraryStore((s) => s.loadState);
  const loadError = useLibraryStore((s) => s.loadError);
  const imageCount = useLibraryStore((s) => s.order.length);
  const hasDuplicates = useLibraryStore((s) => s.order.some((id) => s.images[id]?.duplicateOfId));
  const visibleIds = useVisibleImageIds();

  let body: React.ReactNode;
  if (loadState === 'idle' || loadState === 'loading') {
    body = <Message icon={<LoaderCircle className="animate-spin" />} title="Loading your library…" />;
  } else if (loadState === 'error') {
    body = (
      <Message icon={<TriangleAlert />} title="Could not load your library">
        <p>{loadError}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadLibrary()}>
          Try again
        </Button>
      </Message>
    );
  } else if (imageCount === 0) {
    body = (
      <Message icon={<Images />} title="No images yet">
        Drag images or a folder here, or use the buttons above.
      </Message>
    );
  } else if (visibleIds.length === 0) {
    body = (
      <Message icon={<SearchX />} title="No matching images">
        Nothing matches the current search or filter.
      </Message>
    );
  } else {
    body = <ThumbnailGrid ids={visibleIds} label="Images" />;
  }

  return (
    <aside aria-labelledby="library-title" className="flex h-full flex-col bg-surface-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-subtle px-3">
        <h2 id="library-title" className="text-ui-lg font-medium text-fg">
          Library
        </h2>
        <p className="text-ui-sm text-fg-muted tabular-nums" data-testid="library-count">
          {pluralize(imageCount, 'image')}
        </p>
      </div>

      <div className="flex gap-2 p-3">
        <Button size="sm" className="flex-1" onClick={openFilePicker} data-testid="add-images">
          <ImagePlus aria-hidden="true" />
          Add images
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={openFolderPicker} data-testid="add-folder">
          <FolderPlus aria-hidden="true" />
          Add folder
        </Button>
      </div>

      {imageCount > 0 ? <LibraryToolbar visibleIds={visibleIds} hasDuplicates={hasDuplicates} /> : null}
      <UploadFailures />

      <div className="min-h-0 flex-1">{body}</div>
    </aside>
  );
}
