import { applyAdjustments } from '@/lib/image-processing/adjust-kernel';

import type { AdjustWorkerRequest, AdjustWorkerResponse } from './adjust-protocol';

/**
 * Applies the shared pixel kernel off the main thread. Keeps ONE pristine source image (the active image's preview,
 * downscaled for interactivity) and renders adjusted copies from it on request. Memory is bounded by one image.
 */

// The project's TypeScript config targets the DOM lib, so describe the tiny worker surface we use explicitly.
const scope = self as unknown as {
  postMessage: (message: AdjustWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<AdjustWorkerRequest>) => void) | null;
};

let source: ImageData | null = null;
let scratch: Uint8ClampedArray<ArrayBuffer> | null = null;
let canvas: OffscreenCanvas | null = null;

function post(message: AdjustWorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function load(loadId: number, bitmap: ImageBitmap, maxEdge: number): void {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is not available in this worker');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  source = context.getImageData(0, 0, width, height);
  scratch = new Uint8ClampedArray(source.data.length);
  post({ type: 'loaded', loadId, width, height });
}

function render(seq: number, adjustments: Extract<AdjustWorkerRequest, { type: 'render' }>): void {
  if (!source || !scratch || !canvas) {
    post({ type: 'error', seq, loadId: null, message: 'No image loaded' });
    return;
  }
  const started = performance.now();
  scratch.set(source.data); // always start from the pristine pixels: adjustments never accumulate
  applyAdjustments(scratch, 4, adjustments.adjustments);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available in this worker');
  context.putImageData(new ImageData(scratch, source.width, source.height), 0, 0);
  const bitmap = canvas.transferToImageBitmap();
  post({ type: 'rendered', seq, bitmap, ms: performance.now() - started }, [bitmap]);
}

scope.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === 'load') load(message.loadId, message.bitmap, message.maxEdge);
    else render(message.seq, message);
  } catch (error) {
    post({
      type: 'error',
      seq: message.type === 'render' ? message.seq : null,
      loadId: message.type === 'load' ? message.loadId : null,
      message: error instanceof Error ? error.message : 'Unknown worker error',
    });
  }
};
