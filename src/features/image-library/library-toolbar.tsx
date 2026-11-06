'use client';

import { useState } from 'react';
import { Copy, Search, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/stores/library-store';
import type { ImageId } from '@/types/domain';

import { RemoveDialog } from './remove-dialog';

/** Search, duplicate filter, and selection actions for the visible images. */
export function LibraryToolbar({
  visibleIds,
  hasDuplicates,
}: {
  visibleIds: readonly ImageId[];
  hasDuplicates: boolean;
}) {
  const query = useLibraryStore((s) => s.query);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const duplicatesOnly = useLibraryStore((s) => s.duplicatesOnly);
  const setDuplicatesOnly = useLibraryStore((s) => s.setDuplicatesOnly);
  const selection = useLibraryStore((s) => s.selection);
  const selectAll = useLibraryStore((s) => s.selectAll);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedIds = Array.from(selection);
  const selectedCount = selectedIds.length;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by file name"
            aria-label="Search images by file name"
            data-testid="library-search"
            className={cn(
              'h-7 w-full rounded-sm border border-line bg-surface-elevated pr-7 pl-7 text-ui text-fg outline-none',
              'placeholder:text-fg-muted hover:border-line-strong focus-visible:border-brand focus-visible:outline-1 focus-visible:outline-brand',
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-fg-muted outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {hasDuplicates ? (
          <Button
            variant={duplicatesOnly ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Show only duplicates"
            aria-pressed={duplicatesOnly}
            title="Show only images identical to an earlier one"
            onClick={() => setDuplicatesOnly(!duplicatesOnly)}
            className={duplicatesOnly ? 'border-brand text-brand' : undefined}
          >
            <Copy />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => (allVisibleSelected ? clearSelection() : selectAll(visibleIds))}
          disabled={visibleIds.length === 0}
          data-testid="select-all"
        >
          {allVisibleSelected ? 'Select none' : 'Select all'}
        </Button>
        <span className="flex-1 text-center text-ui-sm text-fg-muted tabular-nums" data-testid="selected-count">
          {selectedCount > 0 ? `${formatCount(selectedCount)} selected` : ''}
        </span>
        <Button
          variant="ghost"
          size="xs"
          disabled={selectedCount === 0}
          onClick={() => setConfirmOpen(true)}
          data-testid="remove-selected"
          className="text-danger hover:text-danger"
        >
          <Trash2 />
          Remove
        </Button>
      </div>

      <RemoveDialog ids={selectedIds as ImageId[]} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </div>
  );
}
