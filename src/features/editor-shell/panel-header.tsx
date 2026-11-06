import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PanelHeaderProps = { id?: string; title: string; meta?: ReactNode; className?: string };

/** 36px panel header (SKILLS.md §B.11). */
export function PanelHeader({ id, title, meta, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex h-9 shrink-0 items-center justify-between border-b border-line-subtle px-3', className)}>
      <h2 id={id} className="text-ui-lg font-medium text-fg">
        {title}
      </h2>
      {meta ? <div className="text-ui-sm text-fg-muted tabular-nums">{meta}</div> : null}
    </div>
  );
}
