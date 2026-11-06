'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { ClickModifiers } from '@/lib/library/selection';
import { useLibraryStore } from '@/stores/library-store';
import type { ImageId } from '@/types/domain';

import { cellDomId, ThumbnailCell } from './thumbnail-cell';
import { useElementWidth } from './use-element-width';

const TARGET_CELL_PX = 112;
const MIN_COLUMNS = 2;
const OVERSCAN_ROWS = 4;

type ThumbnailGridProps = { ids: readonly ImageId[]; label: string };

/**
 * Virtualized thumbnail grid (SKILLS.md §B.12, §D.7). Only the visible rows plus a small overscan exist in
 * the DOM, whatever the batch size. Keyboard model (§B.15): the container holds focus and exposes the
 * current tile via `aria-activedescendant`, because the focused tile may not be mounted.
 */
export function ThumbnailGrid({ ids, label }: ThumbnailGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  const columns = Math.max(MIN_COLUMNS, Math.floor(width / TARGET_CELL_PX));
  const cell = width > 0 ? Math.floor(width / columns) : TARGET_CELL_PX;
  const rowCount = Math.ceil(ids.length / columns);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unmemoizable functions; the React Compiler is not enabled in this project
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => cell,
    overscan: OVERSCAN_ROWS,
  });

  useEffect(() => {
    virtualizer.measure(); // row height depends on panel width
  }, [cell, virtualizer]);

  // Handlers read the latest ids through a ref, so their identity (and every memoized cell) stays stable.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const [focusIndex, setFocusIndex] = useState(0);
  const [gridFocused, setGridFocused] = useState(false);
  const lastIndex = ids.length - 1;
  const focus = Math.min(Math.max(focusIndex, 0), Math.max(lastIndex, 0));

  const moveFocus = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), idsRef.current.length - 1);
      setFocusIndex(clamped);
      virtualizer.scrollToIndex(Math.floor(clamped / columns), { align: 'auto' });
      return clamped;
    },
    [columns, virtualizer],
  );

  const handlePick = useCallback((id: ImageId, index: number, modifiers: ClickModifiers) => {
    setFocusIndex(index);
    useLibraryStore.getState().clickImage(id, modifiers, idsRef.current);
  }, []);

  const handleToggle = useCallback((id: ImageId, index: number) => {
    setFocusIndex(index);
    useLibraryStore.getState().toggleImage(id);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const store = useLibraryStore.getState();
    const current = idsRef.current;
    if (current.length === 0) return;
    const rowsPerPage = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? cell) / cell) - 1);
    const mod = event.ctrlKey || event.metaKey;

    let target: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        target = focus + 1;
        break;
      case 'ArrowLeft':
        target = focus - 1;
        break;
      case 'ArrowDown':
        target = focus + columns;
        break;
      case 'ArrowUp':
        target = focus - columns;
        break;
      case 'PageDown':
        target = focus + columns * rowsPerPage;
        break;
      case 'PageUp':
        target = focus - columns * rowsPerPage;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = current.length - 1;
        break;
      case ' ': {
        const id = current[focus];
        if (id) store.toggleImage(id);
        event.preventDefault();
        return;
      }
      case 'Enter': {
        const id = current[focus];
        if (id) store.clickImage(id, { shift: false, toggle: false }, current);
        event.preventDefault();
        return;
      }
      case 'a':
      case 'A':
        if (mod) {
          store.selectAll(current);
          event.preventDefault();
        }
        return;
      case 'Escape':
        store.clearSelection();
        return;
      default:
        return;
    }

    event.preventDefault();
    const moved = moveFocus(target);
    // Shift+navigation extends the selection from the anchor, like a file manager.
    if (event.shiftKey) {
      const id = current[moved];
      if (id) store.clickImage(id, { shift: true, toggle: false }, current);
    }
  };

  const items = virtualizer.getVirtualItems();
  const focusRow = Math.floor(focus / columns);
  const focusedId = ids[focus];
  const focusMounted = items.some((item) => item.index === focusRow);

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={label}
      aria-multiselectable="true"
      aria-activedescendant={focusedId && focusMounted ? cellDomId(focusedId) : undefined}
      tabIndex={0}
      data-testid="thumbnail-grid"
      onKeyDown={handleKeyDown}
      onFocus={() => setGridFocused(true)}
      onBlur={() => setGridFocused(false)}
      className="h-full overflow-y-auto overscroll-contain px-0.5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {items.map((row) => {
          const start = row.index * columns;
          return (
            <div
              key={row.key}
              role="presentation"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: cell,
                transform: `translateY(${row.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, ${cell}px)`,
                // Explicit row size: with `auto`, a tall image's intrinsic height inflates the track and overlaps the next row.
                gridAutoRows: `${cell}px`,
              }}
            >
              {ids.slice(start, start + columns).map((id, offset) => (
                <ThumbnailCell
                  key={id}
                  id={id}
                  index={start + offset}
                  focused={gridFocused && start + offset === focus}
                  onPick={handlePick}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
