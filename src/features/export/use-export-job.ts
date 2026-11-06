'use client';

import { useEffect, useState } from 'react';

import { fetchJob, fetchLatestJob } from '@/lib/api/jobs-api';
import { isActiveJob } from '@/lib/api/jobs-schemas';
import { useExportStore } from '@/stores/export-store';

/** Restore server-owned progress after a reload; close the dialog without stopping its job. */
export function useExportJob() {
  const job = useExportStore((s) => s.job);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestJob(controller.signal).then((result) => {
      if (!controller.signal.aborted && result.ok && !useExportStore.getState().job)
        useExportStore.getState().setJob(result.value.job);
    });
    return () => controller.abort();
  }, []);
  const id = job?.id;
  const status = job?.status;
  useEffect(() => {
    if (!id || !status || !isActiveJob({ status })) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await fetchJob(id, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        setConnectionError(null);
        const current = useExportStore.getState().job;
        if (
          current?.id === id &&
          isActiveJob(current) &&
          !(current.status === 'cancelling' && result.value.job.status === 'running')
        )
          useExportStore.getState().setJob(result.value.job);
      } else if (result.error.status === 404) {
        useExportStore.getState().setJob(null);
        setConnectionError(null);
      } else setConnectionError('Could not refresh progress. Reconnecting…');
      timer = setTimeout(() => void poll(), 1000);
    };
    timer = setTimeout(() => void poll(), 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, status]);
  return { job, connectionError };
}
