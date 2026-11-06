import { FACE_MIN_CONFIDENCE, FACE_MODEL_PATH, MEDIAPIPE_WASM_PATH } from '@/lib/face-detection/constants';
import type { RawFace } from '@/lib/face-detection/convert';

/**
 * Main-thread handle to the detection worker (`public/workers/face-detection.worker.js`, a classic worker: ADR-016).
 * Requests are matched to replies by id. A FATAL error means the detector cannot run at all (for example the model file is
 * not installed), which callers treat as "face detection unavailable" instead of retrying every image.
 */

export class DetectionUnavailableError extends Error {
  override readonly name = 'DetectionUnavailableError';
}

type WorkerReply =
  | { type: 'result'; id: number; width: number; height: number; faces: RawFace[] }
  | { type: 'error'; id: number; message: string; fatal: boolean };

export type RawDetection = { width: number; height: number; faces: RawFace[] };

export class FaceDetectionClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<
    number,
    { resolve: (value: RawDetection) => void; reject: (error: Error) => void }
  >();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker('/workers/face-detection.worker.js'); // classic worker
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const entry = this.waiting.get(reply.id);
      if (!entry) return;
      this.waiting.delete(reply.id);
      if (reply.type === 'result') entry.resolve({ width: reply.width, height: reply.height, faces: reply.faces });
      else entry.reject(reply.fatal ? new DetectionUnavailableError(reply.message) : new Error(reply.message));
    };
    worker.onerror = () => this.failAll(new DetectionUnavailableError('The face-detection worker could not start'));
    this.worker = worker;
    return worker;
  }

  private failAll(error: Error): void {
    for (const entry of this.waiting.values()) entry.reject(error);
    this.waiting.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  /** Detect faces in a bitmap. Takes ownership of `bitmap` (it is transferred to the worker and closed there). */
  detect(bitmap: ImageBitmap): Promise<RawDetection> {
    const id = this.nextId++;
    return new Promise<RawDetection>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      try {
        this.ensureWorker().postMessage(
          {
            type: 'detect',
            id,
            bitmap,
            minConfidence: FACE_MIN_CONFIDENCE,
            wasmPath: MEDIAPIPE_WASM_PATH,
            modelPath: FACE_MODEL_PATH,
          },
          [bitmap],
        );
      } catch (error) {
        this.waiting.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(): void {
    this.failAll(new Error('Disposed'));
  }
}
