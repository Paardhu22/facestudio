'use client';

import { Check, Download, LoaderCircle, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isActiveJob, type ExportJob } from '@/lib/api/jobs-schemas';
import { formatBytes, pluralize } from '@/lib/format';

export function ExportProgress({
  job,
  busy,
  onAction,
  onNew,
}: {
  job: ExportJob;
  busy: boolean;
  onAction: (action: 'cancel' | 'retry') => void;
  onNew: () => void;
}) {
  const active = isActiveJob(job);
  const processed = job.totals.done + job.totals.failed + job.totals.cancelled;
  const percent = job.totals.items ? Math.round((processed / job.totals.items) * 100) : 0;
  const label =
    job.status === 'cancelling'
      ? 'Finishing current images before cancelling…'
      : job.phase === 'packaging'
        ? 'Preparing your ZIP…'
        : job.status === 'queued'
          ? 'Waiting to start…'
          : job.status === 'running'
            ? 'Rendering full-resolution photos…'
            : job.status === 'cancelled'
              ? 'Export cancelled'
              : job.status === 'failed'
                ? 'Export needs attention'
                : job.status === 'completed_with_errors'
                  ? 'Finished with some images skipped'
                  : !job.artifact
                    ? 'This download has expired. Start a new export.'
                    : 'Your photos are ready';
  return (
    <div className="space-y-4" data-testid="export-progress">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface-elevated">
          {active ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-brand" />
          ) : job.artifact ? (
            <Check aria-hidden="true" className="size-5 text-success" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-5 text-warning" />
          )}
        </span>
        <div>
          <p className="text-ui-lg font-medium" aria-live="polite">
            {label}
          </p>
          <p className="mt-1 text-ui-sm text-fg-muted tabular-nums">
            {job.totals.done} exported / {pluralize(job.totals.items, 'photo')}
            {job.totals.failed > 0 ? `, ${job.totals.failed} failed` : ''}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuenow={processed}
        aria-valuemin={0}
        aria-valuemax={job.totals.items}
        className="h-1.5 overflow-hidden rounded-full bg-line-subtle"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      {job.errorMessage && <p className="text-ui text-warning">{job.errorMessage}</p>}
      {job.status === 'queued' && (
        <p className="text-ui-sm text-fg-muted">Your batch is saved. Processing continues while you use the editor.</p>
      )}
      {job.errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-line p-3">
          <h3 className="mb-2 text-ui font-medium">Images needing attention</h3>
          {job.totals.failed > job.errors.length && (
            <p className="mb-2 text-ui-sm text-fg-muted">
              Showing {job.errors.length} of {job.totals.failed} failures. Retry includes all failed images.
            </p>
          )}
          <ul className="space-y-2">
            {job.errors.map((item) => (
              <li key={item.imageId} className="text-ui-sm">
                <p className="truncate text-fg-secondary">{item.filename}</p>
                <p className="text-fg-muted">{item.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {job.artifact && (
        <div className="rounded-md border border-line bg-surface-canvas p-3">
          <p className="text-ui text-fg-secondary tabular-nums">
            {pluralize(job.artifact.fileCount, 'photo')} · {formatBytes(job.artifact.byteSize)}
          </p>
          <p className="mt-1 text-ui-sm text-fg-muted">
            Download available until {new Date(job.artifact.expiresAt).toLocaleString()}.
          </p>
          <Button asChild className="mt-3 w-full">
            <a href={`/api/artifacts/${job.artifact.id}/download`}>
              <Download aria-hidden="true" />
              Download ZIP
            </a>
          </Button>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {active ? (
          <Button variant="secondary" disabled={busy || job.status === 'cancelling'} onClick={() => onAction('cancel')}>
            Cancel export
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onNew}>
              New export
            </Button>
            {['failed', 'completed_with_errors'].includes(job.status) && (
              <Button loading={busy} onClick={() => onAction('retry')}>
                Retry failed
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
