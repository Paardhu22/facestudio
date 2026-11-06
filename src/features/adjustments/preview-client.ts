import type { AdjustWorkerRequest, AdjustWorkerResponse } from '@/workers/adjust-protocol';
import type { ImageAdjustments } from '@/types/domain';

/**
 * Main-thread handle to the adjustment worker. Rendering is "latest wins": while one render is running, only the most
 * recent requested adjustments are kept, so dragging a slider never builds a backlog and the preview always converges
 * on the final value. One worker is shared for the page; it holds one image at a time.
 */

/** Long edge the worker renders at: plenty for the canvas area, and keeps the per-frame pixel work small. */
export const PREVIEW_RENDER_EDGE = 1600;

export type RenderResult = { bitmap: ImageBitmap; ms: number };

export class AdjustPreviewClient {
  private worker: Worker | null = null;
  private seq = 0;
  private loadSeq = 0;
  /**
   * The load whose reply we are waiting for. Replies are matched by id: the worker handles messages in order, so when
   * an image is replaced before its predecessor finished loading, the predecessor's reply arrives first and must not
   * be mistaken for the new image's size.
   */
  private currentLoad: {
    id: number;
    resolve: (size: { width: number; height: number }) => void;
    reject: (error: Error) => void;
  } | null = null;
  private inFlight: { seq: number; resolve: (result: RenderResult | null) => void } | null = null;
  private pending: { adjustments: ImageAdjustments; resolve: (result: RenderResult | null) => void } | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../../workers/adjust.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<AdjustWorkerResponse>) => this.handle(event.data);
    worker.onerror = () => this.fail('The preview worker stopped unexpectedly');
    this.worker = worker;
    return worker;
  }

  private send(message: AdjustWorkerRequest, transfer: Transferable[] = []): void {
    this.ensureWorker().postMessage(message, transfer);
  }

  private fail(message: string): void {
    this.currentLoad?.reject(new Error(message));
    this.currentLoad = null;
    this.inFlight?.resolve(null);
    this.inFlight = null;
    this.pending?.resolve(null);
    this.pending = null;
  }

  private handle(message: AdjustWorkerResponse): void {
    if (message.type === 'loaded') {
      if (this.currentLoad?.id === message.loadId) {
        this.currentLoad.resolve({ width: message.width, height: message.height });
        this.currentLoad = null;
      }
      return; // a reply for a superseded load: ignore
    }
    if (message.type === 'error') {
      if (message.loadId !== null) {
        if (this.currentLoad?.id === message.loadId) {
          this.currentLoad.reject(new Error(message.message));
          this.currentLoad = null;
        }
      } else if (message.seq === null) this.fail(message.message);
      else if (this.inFlight?.seq === message.seq) {
        this.inFlight.resolve(null);
        this.inFlight = null;
        this.drain();
      }
      return;
    }
    // rendered
    const current = this.inFlight;
    if (current?.seq === message.seq) {
      this.inFlight = null;
      current.resolve({ bitmap: message.bitmap, ms: message.ms });
    } else {
      message.bitmap.close(); // stale result for a request we no longer care about
    }
    this.drain();
  }

  private drain(): void {
    if (this.inFlight || !this.pending) return;
    const { adjustments, resolve } = this.pending;
    this.pending = null;
    const seq = ++this.seq;
    this.inFlight = { seq, resolve };
    this.send({ type: 'render', seq, adjustments });
  }

  /** Give the worker a new source image. Takes ownership of `bitmap` (it is transferred). */
  load(bitmap: ImageBitmap): Promise<{ width: number; height: number }> {
    this.currentLoad?.reject(new Error('Superseded by a newer image'));
    this.currentLoad = null;
    this.pending?.resolve(null);
    this.pending = null;
    const id = ++this.loadSeq;
    return new Promise((resolve, reject) => {
      this.currentLoad = { id, resolve, reject };
      this.send({ type: 'load', loadId: id, bitmap, maxEdge: PREVIEW_RENDER_EDGE }, [bitmap]);
    });
  }

  /**
   * Render the loaded image with these adjustments. Resolves with the bitmap (caller closes it), or `null` when this
   * request was superseded by a newer one before it ran.
   */
  render(adjustments: ImageAdjustments): Promise<RenderResult | null> {
    return new Promise((resolve) => {
      this.pending?.resolve(null); // coalesce: the older waiting request is dropped
      this.pending = { adjustments, resolve };
      this.drain();
    });
  }

  dispose(): void {
    this.fail('Disposed');
    this.worker?.terminate();
    this.worker = null;
  }
}

let shared: AdjustPreviewClient | null = null;

export function getPreviewClient(): AdjustPreviewClient {
  shared ??= new AdjustPreviewClient();
  return shared;
}
