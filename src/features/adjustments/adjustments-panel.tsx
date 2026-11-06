'use client';

import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import {
  ADJUSTMENT_ORDER,
  ADJUSTMENT_SPEC,
  DEFAULT_ADJUSTMENTS,
  isNeutralAdjustments,
} from '@/lib/image-processing/adjustment-spec';
import { selectAdjustments, useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { ImageId } from '@/types/domain';

import { AdjustmentSlider } from './adjustment-slider';

function SyncStatus() {
  const syncState = useEditStore((s) => s.syncState);
  const hasUnsaved = useEditStore((s) => s.dirty.size > 0);
  const text =
    syncState === 'error' ? 'Could not save, retrying…' : syncState === 'saving' || hasUnsaved ? 'Saving…' : 'Saved';
  return (
    <span
      role="status"
      data-testid="edit-sync-status"
      className={syncState === 'error' ? 'text-ui-sm text-warning' : 'text-ui-sm text-fg-muted'}
    >
      {text}
    </span>
  );
}

/**
 * Adjustments for the open image (SKILLS.md §E-7). The sliders always edit the OPEN image; "Apply to selected" and
 * "Apply to all" copy its current settings to those images as one undoable operation. The scope is spelled out in each
 * button label, with its image count.
 */
export function AdjustmentsPanel({ id }: { id: ImageId }) {
  const current = useEditStore(selectAdjustments(id));
  const selection = useLibraryStore((s) => s.selection);
  const imageCount = useLibraryStore((s) => s.order.length);

  const edited = !isNeutralAdjustments(current);
  const selectedIds = Array.from(selection);
  const othersSelected = selectedIds.filter((selectedId) => selectedId !== id).length;

  const applyTo = (ids: readonly ImageId[], label: string) =>
    useEditStore.getState().applyTo(ids, useEditStore.getState().edits[id]?.adjustments ?? DEFAULT_ADJUSTMENTS, label);
  const resetImage = () => {
    useEditStore.getState().applyTo([id], DEFAULT_ADJUSTMENTS, 'Reset adjustments');
  };

  return (
    <section aria-label="Adjustments" className="border-b border-line-subtle px-3 py-3" data-testid="adjustments-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-ui-xs font-medium tracking-wider text-fg-muted uppercase">Adjust</h3>
        <SyncStatus />
      </div>

      <div className="flex flex-col gap-3">
        {ADJUSTMENT_ORDER.map((key) => (
          <AdjustmentSlider key={key} id={id} definition={ADJUSTMENT_SPEC[key]} />
        ))}
      </div>

      <div className="mt-4 grid gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={othersSelected === 0}
          onClick={() => applyTo(selectedIds, 'Apply to selected')}
          data-testid="apply-selected"
          title={othersSelected === 0 ? 'Select other images (Ctrl+click) to copy these settings to them' : undefined}
        >
          Apply to selected ({formatCount(selectedIds.length)})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={imageCount < 2}
          onClick={() => applyTo(useLibraryStore.getState().order, 'Apply to all')}
          data-testid="apply-all"
        >
          Apply to all ({formatCount(imageCount)})
        </Button>
        <Button size="sm" variant="ghost" disabled={!edited} onClick={resetImage} data-testid="reset-adjustments">
          Reset adjustments
        </Button>
      </div>
    </section>
  );
}
