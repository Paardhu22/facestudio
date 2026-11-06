'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { changeJob, fetchLatestJob, startExport } from '@/lib/api/jobs-api';
import { isActiveJob } from '@/lib/api/jobs-schemas';
import { DEFAULT_OUTPUT } from '@/lib/cropping/output';
import { DEFAULT_EDIT, useEditStore } from '@/stores/edit-store';
import { useExportStore } from '@/stores/export-store';
import { useLibraryStore } from '@/stores/library-store';

import { ExportOptions, type ExportOptionsValue } from './export-options';
import { ExportProgress } from './export-progress';
import { useExportJob } from './use-export-job';

export function ExportControl() {
  const count = useLibraryStore((s) => s.order.length);
  const selectedCount = useLibraryStore((s) => s.selection.size);
  const activeId = useLibraryStore((s) => s.activeId);
  const { job, connectionError } = useExportJob();
  const [open, setOpen] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ExportOptionsValue>({
    scope: 'all',
    format: 'individual',
    preserveFolders: false,
    filenameTemplate: '',
  });
  const active = job ? isActiveJob(job) : false;
  const counts = { current: activeId ? 1 : 0, selected: selectedCount, all: count };
  const selected = counts[options.scope];
  const showProgress = job && !configuring;

  async function start() {
    setBusy(true);
    setError(null);
    const library = useLibraryStore.getState();
    const ids =
      options.scope === 'current'
        ? library.activeId
          ? [library.activeId]
          : []
        : options.scope === 'selected'
          ? library.order.filter((id) => library.selection.has(id))
          : library.order;
    const edits = useEditStore.getState().edits;
    const items = ids.map((id) => {
      const edit = edits[id] ?? DEFAULT_EDIT;
      const output =
        options.format === 'individual' && !options.filenameTemplate.trim()
          ? edit.output
          : {
              ...DEFAULT_OUTPUT,
              ...edit.output,
              ...(options.format === 'individual' ? {} : { format: options.format }),
              ...(options.filenameTemplate.trim() ? { filenameTemplate: options.filenameTemplate.trim() } : {}),
            };
      return { id, ...edit, output };
    });
    const result = await startExport(items, options.preserveFolders);
    setBusy(false);
    if (result.ok) {
      useExportStore.getState().setJob(result.value.job);
      setConfiguring(false);
    } else {
      setError(result.error.message);
      if (result.error.code === 'conflict') {
        const existing = await fetchLatestJob();
        if (existing.ok && existing.value.job) {
          useExportStore.getState().setJob(existing.value.job);
          setConfiguring(false);
        }
      }
    }
  }
  async function action(action: 'cancel' | 'retry') {
    if (!job) return;
    setBusy(true);
    setError(null);
    const result = await changeJob(job.id, action);
    setBusy(false);
    if (result.ok) useExportStore.getState().setJob(result.value.job);
    else setError(result.error.message);
  }
  return (
    <>
      <Button
        size="sm"
        disabled={count === 0 && !job}
        title={count === 0 && !job ? 'Add photos to export' : undefined}
        onClick={() => {
          setOpen(true);
          setError(null);
          if (active) setConfiguring(false);
        }}
        data-testid="open-export"
      >
        <Download aria-hidden="true" />
        {active ? 'Export progress' : 'Export photos'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[640px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export photos</DialogTitle>
            <DialogDescription>
              {showProgress
                ? 'Progress and downloads are saved with your browser session.'
                : 'Choose your photos and download the finished batch.'}
            </DialogDescription>
          </DialogHeader>
          {showProgress ? (
            <ExportProgress
              job={job}
              busy={busy}
              onAction={action}
              onNew={() => {
                setConfiguring(true);
                setError(null);
              }}
            />
          ) : (
            <ExportOptions value={options} onChange={setOptions} counts={counts} />
          )}
          {(error || (active && connectionError)) && (
            <p role="alert" className="text-ui text-warning">
              {error ?? connectionError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            {!showProgress && (
              <Button
                loading={busy}
                disabled={selected === 0 || active}
                onClick={() => void start()}
                data-testid="start-export"
              >
                Export {selected} {selected === 1 ? 'photo' : 'photos'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
