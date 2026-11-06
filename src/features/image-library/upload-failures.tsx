'use client';

import { CircleAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { pluralize } from '@/lib/format';
import { MAX_DISPLAYED_FAILURES, useUploadStore } from '@/stores/upload-store';

/**
 * Files that could not be added, with the reason (SKILLS.md §B.12 "failed" state, §C.11). Native
 * `<details>` keeps it keyboard-accessible and collapsed by default. A failed file's handle is already
 * released (§D.7), so retrying means adding the file again.
 */
export function UploadFailures() {
  const failures = useUploadStore((s) => s.failures);
  const failedCount = useUploadStore((s) => s.failed);
  const dismissFailures = useUploadStore((s) => s.dismissFailures);
  const dismissFailure = useUploadStore((s) => s.dismissFailure);

  if (failures.length === 0) return null;

  return (
    <details
      data-testid="upload-failures"
      className="group mx-3 mb-2 rounded-md border border-danger/40 bg-danger/10 text-ui"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-1.5 text-fg outline-none focus-visible:outline-2 focus-visible:outline-brand">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-danger" />
        <span className="flex-1 truncate">{pluralize(Math.max(failedCount, failures.length), 'file')} not added</span>
        <span className="text-ui-sm text-fg-muted group-open:hidden">Show</span>
        <span className="hidden text-ui-sm text-fg-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-danger/30 px-2.5 py-2">
        <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {failures.map((failure) => (
            <li key={failure.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-fg" title={failure.name}>
                  {failure.name}
                </p>
                <p className="text-ui-sm text-fg-secondary">{failure.message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Dismiss ${failure.name}`}
                onClick={() => dismissFailure(failure.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
        {failedCount > MAX_DISPLAYED_FAILURES ? (
          <p className="mt-1.5 text-ui-sm text-fg-muted">Showing the first {MAX_DISPLAYED_FAILURES} failures.</p>
        ) : null}
        <Button variant="ghost" size="xs" className="mt-2" onClick={dismissFailures}>
          Dismiss all
        </Button>
      </div>
    </details>
  );
}
