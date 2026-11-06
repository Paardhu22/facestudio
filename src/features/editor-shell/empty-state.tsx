import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type EmptyStateProps = { icon: ReactNode; title: string; children?: ReactNode; className?: string };

/** Centered empty state used inside editor regions until their feature has content. */
export function EmptyState({ icon, title, children, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-lg border border-line bg-surface-elevated text-fg-muted [&_svg]:size-5"
      >
        {icon}
      </span>
      <p className="text-ui-lg font-medium text-fg">{title}</p>
      {children ? <div className="max-w-72 text-ui leading-relaxed text-fg-muted">{children}</div> : null}
    </div>
  );
}
