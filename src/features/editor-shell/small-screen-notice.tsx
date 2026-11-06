import Link from 'next/link';
import { Monitor } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Shown below 1024px instead of a broken editor layout (SKILLS.md §B.16). */
export function SmallScreenNotice({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center', className)}>
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-lg border border-line bg-surface-panel text-fg-muted"
      >
        <Monitor className="size-6" />
      </span>
      <h1 className="text-xl font-semibold text-fg">The editor needs a larger screen</h1>
      <p className="max-w-sm text-sm leading-relaxed text-fg-secondary">
        FaceStudio&apos;s editor is designed for screens at least 1024 pixels wide. Open it on a desktop or laptop, or
        widen your browser window.
      </p>
      <Button asChild variant="secondary" size="lg">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
