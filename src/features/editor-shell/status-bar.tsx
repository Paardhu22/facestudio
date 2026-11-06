'use client';

import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/button';
import { cancelUploads } from '@/features/upload';
import { formatCount, pluralize } from '@/lib/format';
import { isActiveJob } from '@/lib/api/jobs-schemas';
import { useExportStore } from '@/stores/export-store';
import { useLibraryStore } from '@/stores/library-store';
import { isDetecting, useDetectionStore } from '@/stores/detection-store';
import { isUploading, useUploadStore } from '@/stores/upload-store';

/**
 * Bottom status bar (SKILLS.md §B.11, §B.14): counts, determinate upload progress, and a polite live
 * region. Screen readers hear milestones every 10% and the final result, not every file.
 */
export function StatusBar() {
  const exportJob = useExportStore((s) => s.job);
  const exporting = exportJob && isActiveJob(exportJob);
  const imageCount = useLibraryStore((s) => s.order.length);
  const selectedCount = useLibraryStore((s) => s.selection.size);
  const upload = useUploadStore(
    useShallow((s) => ({ total: s.total, done: s.done, failed: s.failed, cancelled: s.cancelled, skipped: s.skipped })),
  );
  const detection = useDetectionStore(useShallow((s) => ({ total: s.total, done: s.done })));
  const detecting = isDetecting(detection);
  const active = isUploading(upload);
  const finished = upload.total > 0 && !active;
  const processed = upload.done + upload.failed + upload.cancelled;
  const percent = upload.total > 0 ? Math.floor((processed / upload.total) * 100) : 0;
  const bucket = Math.floor(percent / 10);

  const summaryParts = [`Added ${pluralize(upload.done, 'image')}`];
  if (upload.failed > 0) summaryParts.push(`${formatCount(upload.failed)} failed`);
  if (upload.cancelled > 0) summaryParts.push(`${formatCount(upload.cancelled)} cancelled`);
  if (upload.skipped > 0) summaryParts.push(`${pluralize(upload.skipped, 'non-image file')} skipped`);
  const summary = summaryParts.join(' · ');

  // Assistive tech announces a live region only when its text changes: while uploading, the text changes
  // once per 10% step (not per file), then once more with the final summary.
  const announcement = active
    ? `Uploading, ${bucket * 10} percent`
    : finished || upload.skipped > 0
      ? summary
      : 'Ready';

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-surface-app px-3 text-ui-sm text-fg-muted">
      <span className="tabular-nums" data-testid="status-image-count">
        {pluralize(imageCount, 'image')}
      </span>
      <span aria-hidden="true" className="h-3 w-px bg-line" />
      <span className="tabular-nums" data-testid="status-selected-count">
        {formatCount(selectedCount)} selected
      </span>

      {exporting ? (
        <span className="ml-auto text-brand tabular-nums" data-testid="export-status">
          {exportJob.phase === 'packaging'
            ? 'Preparing ZIP…'
            : `Exporting ${exportJob.totals.done} / ${exportJob.totals.items}`}
        </span>
      ) : null}

      {detecting ? (
        <div className="ml-auto flex items-center gap-2" data-testid="detection-progress">
          <span className="tabular-nums">
            Detecting faces {formatCount(detection.done)} / {formatCount(detection.total)}
          </span>
          <div
            role="progressbar"
            aria-label="Face detection progress"
            aria-valuemin={0}
            aria-valuemax={detection.total}
            aria-valuenow={detection.done}
            className="h-1 w-24 overflow-hidden rounded-full bg-line-subtle"
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.round((detection.done / detection.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {active ? (
        <div
          className={detecting ? 'flex items-center gap-2' : 'ml-auto flex items-center gap-2'}
          data-testid="upload-progress"
        >
          <span className="tabular-nums">
            Uploading {formatCount(processed)} / {formatCount(upload.total)}
          </span>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={upload.total}
            aria-valuenow={processed}
            className="h-1 w-32 overflow-hidden rounded-full bg-line-subtle"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
          </div>
          {upload.failed > 0 ? (
            <span className="text-danger tabular-nums">{formatCount(upload.failed)} failed</span>
          ) : null}
          <Button variant="ghost" size="xs" onClick={cancelUploads} data-testid="cancel-uploads">
            Cancel
          </Button>
        </div>
      ) : finished || upload.skipped > 0 ? (
        <div
          className={detecting ? 'flex items-center gap-2' : 'ml-auto flex items-center gap-2'}
          data-testid="upload-summary"
        >
          <span className={upload.failed > 0 ? 'text-warning' : undefined}>{summary}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => useUploadStore.getState().dismissSummary()}
            aria-label="Dismiss upload summary"
          >
            Dismiss
          </Button>
        </div>
      ) : detecting ? null : (
        <span className="ml-auto">Ready</span>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </footer>
  );
}
