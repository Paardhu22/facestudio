'use client';

import { Crop, Maximize, SlidersHorizontal } from 'lucide-react';

import { AdjustmentsPanel } from '@/features/adjustments';
import { CropPanel, OutputPanel } from '@/features/cropping';
import { ImageDetails } from '@/features/image-library';
import { useLibraryStore } from '@/stores/library-store';

import { EmptyState } from './empty-state';
import { PanelHeader } from './panel-header';

/**
 * Right panel: editing controls (SKILLS.md §B.11). For the open image: Crop, Adjust, Output, then file details. A panel
 * scrolls as a whole; the sections are ordered by how often they are used.
 */
export function ControlsPanel() {
  const activeId = useLibraryStore((s) => s.activeId);

  return (
    <aside aria-labelledby="controls-title" className="flex h-full flex-col overflow-y-auto bg-surface-panel">
      <PanelHeader id="controls-title" title="Edit" />
      {activeId ? (
        <>
          <CropPanel id={activeId} />
          <AdjustmentsPanel id={activeId} />
          <OutputPanel id={activeId} />
          <ImageDetails />
        </>
      ) : (
        <EmptyState icon={<SlidersHorizontal />} title="Nothing selected">
          <p>Select a photo from your library to bring your tools into focus.</p>
          <div className="controls-empty-guide">
            <div>
              <Crop aria-hidden="true" />
              <p>
                Crop & frame<span>Find the right composition.</span>
              </p>
            </div>
            <div>
              <SlidersHorizontal aria-hidden="true" />
              <p>
                Light & color<span>Fine-tune the feel of each image.</span>
              </p>
            </div>
            <div>
              <Maximize aria-hidden="true" />
              <p>
                Output size<span>Set the dimensions you need.</span>
              </p>
            </div>
          </div>
        </EmptyState>
      )}
    </aside>
  );
}
