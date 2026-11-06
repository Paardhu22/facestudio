import type { ImageAdjustments } from '@/types/domain';

/** Messages between the main thread and `adjust.worker.ts` (live adjustment preview, SKILLS.md §C.6). */

export type AdjustWorkerRequest =
  /** Hand the worker the preview bitmap (transferred). It is downscaled to `maxEdge` and kept as the pristine source. */
  | { type: 'load'; loadId: number; bitmap: ImageBitmap; maxEdge: number }
  | { type: 'render'; seq: number; adjustments: ImageAdjustments };

export type AdjustWorkerResponse =
  | { type: 'loaded'; loadId: number; width: number; height: number }
  | { type: 'rendered'; seq: number; bitmap: ImageBitmap; ms: number }
  | { type: 'error'; seq: number | null; loadId: number | null; message: string };
