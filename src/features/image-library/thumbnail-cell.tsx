'use client';

import { memo, useState } from 'react';
import { Check, Copy, ImageOff } from 'lucide-react';

import { thumbUrl } from '@/lib/api/images-api';
import type { ClickModifiers } from '@/lib/library/selection';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/stores/library-store';
import type { ImageId } from '@/types/domain';

export const cellDomId = (id: ImageId): string => `thumb-${id}`;

type ThumbnailCellProps = {
  id: ImageId;
  index: number;
  /** Keyboard focus is on this cell (and the grid has focus). */
  focused: boolean;
  onPick: (id: ImageId, index: number, modifiers: ClickModifiers) => void;
  onToggle: (id: ImageId, index: number) => void;
};

/**
 * One library tile (SKILLS.md §B.12). Subscribes to only its own image, selection, and active state, so
 * selecting one image re-renders at most two cells. Renders the ≤384px server thumbnail, never the original.
 */
export const ThumbnailCell = memo(function ThumbnailCell({ id, index, focused, onPick, onToggle }: ThumbnailCellProps) {
  const image = useLibraryStore((s) => s.images[id]);
  const selected = useLibraryStore((s) => s.selection.has(id));
  const active = useLibraryStore((s) => s.activeId === id);
  const [broken, setBroken] = useState(false);

  if (!image) return null;
  const name = image.originalFilename;
  const duplicate = image.duplicateOfId !== null;

  return (
    <div className="p-[3px]">
      <div
        role="option"
        id={cellDomId(id)}
        aria-selected={selected}
        aria-label={duplicate ? `${name}, duplicate` : name}
        title={image.relativePath ?? name}
        data-testid="thumbnail"
        data-id={id}
        data-selected={selected}
        data-active={active}
        onClick={(event) => onPick(id, index, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey })}
        className={cn(
          'group relative size-full min-h-0 cursor-pointer overflow-hidden rounded-sm bg-surface-canvas select-none',
          'ring-inset hover:outline-1 hover:-outline-offset-1 hover:outline-line-strong',
          selected && 'ring-1 ring-brand/70',
          active && 'ring-2 ring-brand',
          focused && 'outline-2 -outline-offset-2 outline-fg',
        )}
      >
        {broken ? (
          <span className="absolute inset-0 grid place-items-center text-fg-muted">
            <ImageOff aria-hidden="true" className="size-5" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- session-authenticated, already-resized renditions; the Next image optimizer does not apply
          <img
            src={thumbUrl(id)}
            alt=""
            width={image.renditions.thumb.width}
            height={image.renditions.thumb.height}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setBroken(true)}
            className="absolute inset-0 size-full object-contain"
          />
        )}

        <span
          aria-hidden="true"
          data-testid="thumbnail-check"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(id, index);
          }}
          className={cn(
            'absolute top-1 left-1 grid size-4 place-items-center rounded-[3px] border transition-opacity duration-[120ms]',
            selected
              ? 'border-brand-solid bg-brand-solid text-white opacity-100'
              : 'border-white/70 bg-black/40 text-transparent opacity-0 group-hover:opacity-100',
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>

        {duplicate ? (
          <span
            aria-hidden="true"
            title="Identical to an earlier image"
            className="absolute bottom-1 left-1 grid size-4 place-items-center rounded-[3px] bg-black/60 text-warning"
          >
            <Copy className="size-3" />
          </span>
        ) : null}
      </div>
    </div>
  );
});
