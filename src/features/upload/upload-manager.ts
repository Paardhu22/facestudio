import { isRetryableError } from '@/lib/api/client';
import { uploadImage } from '@/lib/api/images-api';
import { ensureSession } from '@/lib/api/session-api';
import { DEFAULT_LIMITS } from '@/lib/config/limits';
import { formatBytes, pluralize } from '@/lib/format';
import { hasSupportedExtension } from '@/lib/validation/filenames';
import { SIGNATURE_BYTES, sniffImageType } from '@/lib/validation/image-signature';
import { useLibraryStore } from '@/stores/library-store';
import { isUploading, MAX_DISPLAYED_FAILURES, type UploadFailure, useUploadStore } from '@/stores/upload-store';
import type { SourceImage } from '@/types/domain';

/**
 * Client upload queue (SKILLS.md §E-3, §D.7).
 * - Bounded concurrency (default 4) so 3,000 files never open 3,000 connections.
 * - Each file is pre-checked (size + magic bytes) and streamed to the server as a raw body.
 * - Transient failures retry with exponential backoff; validation failures do not.
 * - The `File` handle is released as soon as its job finishes or fails permanently.
 * - Finished images are batched into the library store every ~100ms to keep React renders cheap.
 */

export type UploadCandidate = { file: File; path: string | null };

const MAX_ATTEMPTS = 3;
const FLUSH_INTERVAL_MS = 100;

/** Mutable only so tests can shrink the timings. */
export const uploadManagerConfig = {
  concurrency: DEFAULT_LIMITS.uploadConcurrency as number,
  retryBaseMs: 500,
};

type Job = { id: string; file: File; path: string | null };

const queue: Job[] = [];
const inFlight = new Map<string, AbortController>();
let nextJobId = 1;
let buffer: SourceImage[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Shared by every job in a run, so the session is created by exactly one request (see `ensureSession`). */
let sessionReady: ReturnType<typeof ensureSession> | null = null;

function ensureSessionOnce(): ReturnType<typeof ensureSession> {
  sessionReady ??= ensureSession().then((result) => {
    if (!result.ok) sessionReady = null; // allow a later attempt to try again
    return result;
  });
  return sessionReady;
}

const naturalCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function pathOf(candidate: UploadCandidate): string {
  return candidate.path ?? candidate.file.name;
}

function appendFailure(failures: readonly UploadFailure[], failure: UploadFailure): readonly UploadFailure[] {
  return failures.length >= MAX_DISPLAYED_FAILURES ? failures : [...failures, failure];
}

function recordFailure(id: string, name: string, message: string): void {
  useUploadStore.setState((state) => ({
    failed: state.failed + 1,
    failures: appendFailure(state.failures, { id, name, message }),
  }));
}

export function flushUploadBuffer(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  useLibraryStore.getState().addImages(batch);
}

function scheduleFlush(): void {
  if (flushTimer === null) flushTimer = setTimeout(flushUploadBuffer, FLUSH_INTERVAL_MS);
}

async function precheck(file: File, maxFileBytes: number): Promise<string | null> {
  if (file.size === 0) return 'The file is empty';
  if (file.size > maxFileBytes) return `Larger than the ${formatBytes(maxFileBytes)} file size limit`;
  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  return sniffImageType(head) === null ? 'Not a valid JPEG, PNG, or WebP image' : null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function runJob(job: Job): Promise<void> {
  const controller = new AbortController();
  inFlight.set(job.id, controller); // registered synchronously so `pump` sees the true in-flight count
  try {
    const problem = await precheck(job.file, useLibraryStore.getState().limits.maxFileBytes);
    if (problem) {
      recordFailure(job.id, job.file.name, problem);
      return;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const session = await ensureSessionOnce();
      const result = session.ok ? await uploadImage(job.file, job.path, controller.signal) : session;
      if (result.ok) {
        buffer.push(result.value);
        scheduleFlush();
        useUploadStore.setState((state) => ({ done: state.done + 1 }));
        return;
      }
      if (controller.signal.aborted || result.error.code === 'aborted') {
        useUploadStore.setState((state) => ({ cancelled: state.cancelled + 1 }));
        return;
      }
      if (!isRetryableError(result.error) || attempt === MAX_ATTEMPTS) {
        recordFailure(job.id, job.file.name, result.error.message);
        return;
      }
      await sleep(
        uploadManagerConfig.retryBaseMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5),
        controller.signal,
      );
      if (controller.signal.aborted) {
        useUploadStore.setState((state) => ({ cancelled: state.cancelled + 1 }));
        return;
      }
    }
  } finally {
    inFlight.delete(job.id);
    pump();
  }
}

function pump(): void {
  while (inFlight.size < uploadManagerConfig.concurrency && queue.length > 0) {
    const job = queue.shift();
    if (job) void runJob(job);
  }
}

/**
 * Add files to the upload queue. Unsupported extensions are skipped (not failures), because folders
 * routinely contain unrelated files. Files beyond the batch capacity are reported as one failure.
 */
export function enqueueFiles(candidates: readonly UploadCandidate[]): void {
  if (candidates.length === 0) return;

  if (!isUploading(useUploadStore.getState())) {
    useUploadStore.setState({ total: 0, done: 0, failed: 0, cancelled: 0, skipped: 0 });
    sessionReady = null; // re-verify the session at the start of every run (the cookie may have been cleared)
  }

  const supported = candidates.filter((candidate) => hasSupportedExtension(candidate.file.name));
  supported.sort((a, b) => naturalCollator.compare(pathOf(a), pathOf(b)));

  const { limits, order } = useLibraryStore.getState();
  // Images already in the library or waiting to be flushed count against the batch limit, as do queued jobs.
  const used = order.length + buffer.length + queue.length + inFlight.size;
  const capacity = Math.max(0, limits.maxBatchImages - used);
  const accepted = supported.slice(0, capacity);
  const overflow = supported.length - accepted.length;

  useUploadStore.setState((state) => ({
    total: state.total + supported.length,
    skipped: state.skipped + (candidates.length - supported.length),
    failed: state.failed + overflow,
    failures:
      overflow > 0
        ? appendFailure(state.failures, {
            id: `limit-${nextJobId++}`,
            name: pluralize(overflow, 'file'),
            message: `Not added: a batch can hold at most ${limits.maxBatchImages.toLocaleString('en-US')} images`,
          })
        : state.failures,
  }));

  for (const candidate of accepted)
    queue.push({ id: `upload-${nextJobId++}`, file: candidate.file, path: candidate.path });
  pump();
}

/** Drop queued files and abort in-flight requests. Images already stored stay in the library. */
export function cancelUploads(): void {
  const dropped = queue.length;
  queue.length = 0;
  for (const controller of inFlight.values()) controller.abort();
  if (dropped > 0) useUploadStore.setState((state) => ({ cancelled: state.cancelled + dropped }));
}

/** Test helper: forget all queued and buffered work. */
export function resetUploadManager(): void {
  queue.length = 0;
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  buffer = [];
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  sessionReady = null;
}
