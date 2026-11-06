import nextEnv from '@next/env';
import { availableParallelism, totalmem } from 'node:os';
import { setTimeout } from 'node:timers/promises';

import { getContext } from '../context';
import { claimItem, claimPackaging, finishItem, recoverLeases, renewItem } from '../jobs/queue';
import { packageJob, sweepExports } from '../jobs/archive';
import { LEASE_MS } from '../jobs/types';
import { createRenderSlot } from './pool';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const ctx = getContext();
const maxPixels = Math.max(ctx.limits.maxImagePixels, ctx.limits.maxOutputSide ** 2);
const count = Math.max(
  1,
  Math.min(ctx.limits.workerConcurrency, availableParallelism() - 1, Math.floor((totalmem() * 0.2) / (maxPixels * 12))),
);
const slots = Array.from({ length: count }, () => ({ renderer: createRenderSlot(ctx.config), busy: false }));
const inFlight = new Set<Promise<void>>();
let stopping = false;
let lastSweep = 0;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

while (!stopping) {
  try {
    recoverLeases(ctx);
    for (const slot of slots) {
      if (slot.busy) continue;
      const task = claimItem(ctx);
      if (!task) break;
      slot.busy = true;
      const heartbeat = setInterval(() => renewItem(ctx, task), LEASE_MS / 3);
      const run = slot.renderer
        .render(task)
        .catch(() => false)
        .then(async (ok) => {
          const accepted = finishItem(ctx, task, ok);
          if (!accepted || !ok) await ctx.storage.delete(task.outputKey).catch(() => undefined);
        })
        .catch(() => {
          console.error('[export-worker] An item commit failed; its lease will recover.');
        })
        .finally(() => {
          clearInterval(heartbeat);
          slot.busy = false;
          inFlight.delete(run);
        });
      inFlight.add(run);
    }
    const pack = claimPackaging(ctx);
    if (pack) await packageJob(ctx, pack);
    if (Date.now() - lastSweep > 60_000) {
      lastSweep = Date.now();
      await sweepExports(ctx);
    }
  } catch {
    console.error('[export-worker] A queue operation failed; retrying.');
  }
  await setTimeout(250);
}
await Promise.allSettled(inFlight);
await Promise.all(slots.map((slot) => slot.renderer.close()));
ctx.db.close();
