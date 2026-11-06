import { parentPort, workerData } from 'node:worker_threads';
import { register } from 'tsx/esm/api';
register();
const { renderImage } = await import('../processing/render.ts');
const { sourceImageSchema, adjustmentsSchema, cropSchema, outputSchema } = await import('../../src/lib/api/schemas.ts');
parentPort.on('message', async (task) => {
  try {
    const image = sourceImageSchema.parse(task.image);
    const edit = {
      adjustments: adjustmentsSchema.parse(task.edit.adjustments),
      crop: cropSchema.nullable().parse(task.edit.crop),
      output: outputSchema.nullable().parse(task.edit.output),
    };
    await renderImage(workerData, task.sessionId, image, edit, task.outputKey);
    parentPort.postMessage({ ok: true });
  } catch {
    parentPort.postMessage({ ok: false });
  }
});
