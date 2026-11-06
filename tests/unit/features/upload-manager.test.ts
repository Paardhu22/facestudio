// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelUploads,
  enqueueFiles,
  flushUploadBuffer,
  resetUploadManager,
  uploadManagerConfig,
} from '@/features/upload/upload-manager';
import { UPLOAD_HEADERS } from '@/lib/api/schemas';
import { DEFAULT_LIMITS } from '@/lib/config/limits';
import { useLibraryStore } from '@/stores/library-store';
import { MAX_DISPLAYED_FAILURES, resetUploadStore, useUploadStore } from '@/stores/upload-store';

import { makeTinyJpeg } from '../../fixtures/images';
import { makeSourceImage } from '../../fixtures/source-image';

const upload = () => useUploadStore.getState();
const library = () => useLibraryStore.getState();

let jpeg: Buffer;
let serial = 0;

const jpegFile = (name: string) => new File([new Uint8Array(jpeg)], name, { type: 'image/jpeg' });
const candidates = (names: string[]) => names.map((name) => ({ file: jpegFile(name), path: null }));

function created(request: RequestInit): Response {
  const headers = new Headers(request.headers);
  const name = decodeURIComponent(headers.get(UPLOAD_HEADERS.filename) ?? 'unknown.jpg');
  serial += 1;
  return Response.json(makeSourceImage(serial, { originalFilename: name }), { status: 201 });
}

type FetchCall = [string, RequestInit | undefined];

/** Stub `fetch`: `/api/session` always succeeds; everything else goes to `handler` (call numbers count uploads only). */
function stubFetch(handler: (request: RequestInit, call: number) => Promise<Response> | Response) {
  let calls = 0;
  const mock = vi.fn(async (url: string, init: RequestInit) =>
    url === '/api/session' ? Response.json({ ok: true }) : handler(init, ++calls),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

const callsTo = (mock: { mock: { calls: unknown[][] } }, url: string): FetchCall[] =>
  (mock.mock.calls as FetchCall[]).filter(([target]) => target === url);
const uploadCalls = (mock: { mock: { calls: unknown[][] } }) => callsTo(mock, '/api/images').length;

const errorResponse = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

beforeEach(async () => {
  jpeg = await makeTinyJpeg(1);
  serial = 0;
  resetUploadManager();
  resetUploadStore();
  library().beginLoad();
  library().finishLoad([], { ...DEFAULT_LIMITS });
  uploadManagerConfig.concurrency = 4;
  uploadManagerConfig.retryBaseMs = 1;
});

afterEach(() => {
  resetUploadManager();
  vi.unstubAllGlobals();
});

const finished = () => {
  const s = upload();
  return s.total > 0 && s.done + s.failed + s.cancelled === s.total;
};

describe('upload manager', () => {
  it('uploads every file with at most 4 requests in flight', async () => {
    let active = 0;
    let peak = 0;
    stubFetch(async (init) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return created(init);
    });

    enqueueFiles(candidates(Array.from({ length: 25 }, (_, i) => `p${i}.jpg`)));
    await vi.waitFor(() => expect(finished()).toBe(true));
    flushUploadBuffer();

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(upload()).toMatchObject({ total: 25, done: 25, failed: 0 });
    expect(library().order).toHaveLength(25);
  });

  it('creates the session ONCE, before any upload is sent, so parallel first uploads share it', async () => {
    const order: string[] = [];
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      order.push(url);
      if (url === '/api/session') {
        await new Promise((resolve) => setTimeout(resolve, 20)); // slow: uploads must wait for it
        return Response.json({ ok: true });
      }
      return created(init);
    });
    vi.stubGlobal('fetch', mock);

    enqueueFiles(candidates(Array.from({ length: 8 }, (_, i) => `p${i}.jpg`)));
    await vi.waitFor(() => expect(finished()).toBe(true));

    expect(callsTo(mock, '/api/session')).toHaveLength(1);
    expect(order[0]).toBe('/api/session'); // nothing was uploaded before the session existed
    expect(uploadCalls(mock)).toBe(8);
    expect(upload().done).toBe(8);
  });

  it('re-verifies the session at the start of each new run', async () => {
    const mock = stubFetch((init) => created(init));
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    enqueueFiles(candidates(['b.jpg']));
    await vi.waitFor(() => expect(upload().total === 1 && finished()).toBe(true));
    expect(callsTo(mock, '/api/session')).toHaveLength(2);
  });

  it('treats a failed session request as a retryable network failure, then recovers', async () => {
    let sessionCalls = 0;
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/session') {
        sessionCalls += 1;
        return sessionCalls === 1 ? errorResponse(503, 'internal_error', 'down') : Response.json({ ok: true });
      }
      return created(init);
    });
    vi.stubGlobal('fetch', mock);
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(sessionCalls).toBe(2);
    expect(upload()).toMatchObject({ done: 1, failed: 0 });
  });

  it('sends the file name and relative path as percent-encoded headers on a raw octet-stream body', async () => {
    const mock = stubFetch((init) => created(init));
    const file = jpegFile('Zoë #1.jpg');
    enqueueFiles([{ file, path: 'Team A/Zoë #1.jpg' }]);
    await vi.waitFor(() => expect(finished()).toBe(true));

    const [url, init] = callsTo(mock, '/api/images')[0] ?? [];
    expect(url).toBe('/api/images');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(file);
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect(decodeURIComponent(headers.get(UPLOAD_HEADERS.filename) ?? '')).toBe('Zoë #1.jpg');
    expect(decodeURIComponent(headers.get(UPLOAD_HEADERS.relativePath) ?? '')).toBe('Team A/Zoë #1.jpg');
  });

  it('skips non-image extensions without counting them as failures', async () => {
    const mock = stubFetch((init) => created(init));
    enqueueFiles([
      ...candidates(['a.jpg']),
      { file: new File(['x'], 'notes.txt'), path: null },
      { file: new File(['x'], '.DS_Store'), path: null },
    ]);
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(upload()).toMatchObject({ total: 1, done: 1, failed: 0, skipped: 2 });
    expect(uploadCalls(mock)).toBe(1);
  });

  it('rejects a wrong signature, an empty file, and an oversize file locally, without any request', async () => {
    const mock = stubFetch((init) => created(init));
    library().finishLoad([], { ...DEFAULT_LIMITS, maxFileBytes: 5000 });
    useLibraryStore.setState({ limits: { ...DEFAULT_LIMITS, maxFileBytes: 5000 } });

    enqueueFiles([
      { file: new File(['this is not an image at all'], 'fake.jpg'), path: null },
      { file: new File([], 'empty.png'), path: null },
      { file: new File([new Uint8Array(6000)], 'huge.webp'), path: null },
    ]);
    await vi.waitFor(() => expect(finished()).toBe(true));

    expect(uploadCalls(mock)).toBe(0);
    expect(upload()).toMatchObject({ total: 3, done: 0, failed: 3 });
    const messages = upload().failures.map((f) => f.message);
    expect(messages.some((m) => m.includes('Not a valid'))).toBe(true);
    expect(messages.some((m) => m.includes('empty'))).toBe(true);
    expect(messages.some((m) => m.includes('file size limit'))).toBe(true);
  });

  it('retries transient server errors with backoff and then succeeds', async () => {
    const mock = stubFetch((init, call) =>
      call < 3 ? errorResponse(503, 'internal_error', 'try later') : created(init),
    );
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(3);
    expect(upload()).toMatchObject({ done: 1, failed: 0 });
  });

  it('retries network errors', async () => {
    const mock = stubFetch((init, call) => {
      if (call === 1) throw new TypeError('fetch failed');
      return created(init);
    });
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(2);
    expect(upload().done).toBe(1);
  });

  it('gives up after 3 attempts on a persistent server error', async () => {
    const mock = stubFetch(() => errorResponse(500, 'internal_error', 'Something went wrong on the server.'));
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(3);
    expect(upload()).toMatchObject({ done: 0, failed: 1 });
    expect(upload().failures[0]).toMatchObject({ name: 'a.jpg', message: 'Something went wrong on the server.' });
  });

  it('does not retry validation errors and surfaces the server message', async () => {
    const mock = stubFetch(() =>
      errorResponse(415, 'unsupported_type', 'Only JPEG, PNG, and WebP images are supported.'),
    );
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(1);
    expect(upload().failures[0]?.message).toBe('Only JPEG, PNG, and WebP images are supported.');
  });

  it('enforces batch capacity and reports the overflow as ONE aggregated failure', async () => {
    useLibraryStore.setState({ limits: { ...DEFAULT_LIMITS, maxBatchImages: 3 } });
    const mock = stubFetch((init) => created(init));
    enqueueFiles(candidates(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(3);
    expect(upload()).toMatchObject({ total: 5, done: 3, failed: 2 });
    expect(upload().failures).toHaveLength(1);
    expect(upload().failures[0]?.message).toContain('at most 3');
  });

  it('counts images already in the library against the batch limit', async () => {
    useLibraryStore.setState({ limits: { ...DEFAULT_LIMITS, maxBatchImages: 2 } });
    library().addImages([makeSourceImage(900), makeSourceImage(901)]);
    const mock = stubFetch((init) => created(init));
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(0);
    expect(upload().failed).toBe(1);
  });

  it('inserts finished images in natural filename order', async () => {
    stubFetch((init) => created(init));
    enqueueFiles(candidates(['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    flushUploadBuffer();
    expect(library().order.map((id) => library().images[id]?.originalFilename)).toEqual([
      'IMG_1.jpg',
      'IMG_2.jpg',
      'IMG_10.jpg',
    ]);
  });

  it('bounds retained failure details but keeps exact counts', async () => {
    const mock = stubFetch((init) => created(init));
    const bad = Array.from({ length: MAX_DISPLAYED_FAILURES + 50 }, (_, i) => ({
      file: new File(['not an image'], `bad${i}.jpg`),
      path: null,
    }));
    enqueueFiles(bad);
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(uploadCalls(mock)).toBe(0);
    expect(upload().failed).toBe(MAX_DISPLAYED_FAILURES + 50);
    expect(upload().failures).toHaveLength(MAX_DISPLAYED_FAILURES);
  });

  it('cancel aborts in-flight requests and drops queued files', async () => {
    stubFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    enqueueFiles(candidates(Array.from({ length: 10 }, (_, i) => `p${i}.jpg`)));
    const fetched = vi.mocked(global.fetch);
    await vi.waitFor(() => expect(uploadCalls(fetched as never)).toBe(4)); // 4 in flight, 6 queued

    cancelUploads();
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(upload()).toMatchObject({ total: 10, done: 0, failed: 0, cancelled: 10 });
    expect(uploadCalls(fetched as never)).toBe(4); // queued files were never started
  });

  it('starts a fresh run (counters reset) when the previous run has finished', async () => {
    stubFetch((init) => created(init));
    enqueueFiles(candidates(['a.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    enqueueFiles(candidates(['b.jpg', 'c.jpg']));
    await vi.waitFor(() => expect(finished()).toBe(true));
    expect(upload()).toMatchObject({ total: 2, done: 2 });
  });

  it('ignores an empty enqueue', () => {
    enqueueFiles([]);
    expect(upload()).toMatchObject({ total: 0, done: 0 });
  });
});
