import { Worker } from 'node:worker_threads';
import { z } from 'zod';

import type { ServerConfig } from '../config';
import type { RenderTask } from '../jobs/types';

const resultSchema = z.object({ ok: z.boolean() });

/** A persistent thread per slot; no image pixels or original buffers cross the parent message boundary. */
export function createRenderSlot(config: ServerConfig) {
  let worker: Worker | null = null;
  let pending: ((ok: boolean) => void) | null = null;
  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('./render-thread.mjs', import.meta.url), {
      workerData: config,
      execArgv: ['--conditions=react-server'],
    });
    worker.on('message', (message: unknown) => {
      const parsed = resultSchema.safeParse(message);
      const resolve = pending;
      pending = null;
      resolve?.(parsed.success && parsed.data.ok);
    });
    worker.on('error', () => {
      const resolve = pending;
      pending = null;
      resolve?.(false);
    });
    worker.on('exit', () => {
      worker = null;
      const resolve = pending;
      pending = null;
      resolve?.(false);
    });
    return worker;
  }
  return {
    render(task: RenderTask): Promise<boolean> {
      if (pending) return Promise.reject(new Error('Render slot is busy'));
      return new Promise((resolve) => {
        pending = resolve;
        try {
          ensureWorker().postMessage(task);
        } catch {
          pending = null;
          resolve(false);
          void worker?.terminate();
          worker = null;
        }
      });
    },
    async close() {
      if (worker) await worker.terminate();
    },
  };
}
