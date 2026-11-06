// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdjustPreviewClient } from '@/features/adjustments/preview-client';
import { DEFAULT_ADJUSTMENTS } from '@/lib/image-processing/adjustment-spec';
import type { AdjustWorkerRequest, AdjustWorkerResponse } from '@/workers/adjust-protocol';

/**
 * A fake worker that, like the real one, handles messages strictly in order, but whose replies the test releases by hand.
 * That lets the tests reproduce timing the real worker only shows under load.
 */
class FakeWorker {
  static instance: FakeWorker | null = null;
  onmessage: ((event: MessageEvent<AdjustWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly received: AdjustWorkerRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instance = this;
  }
  postMessage(message: AdjustWorkerRequest): void {
    this.received.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: AdjustWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<AdjustWorkerResponse>);
  }
  sent<T extends AdjustWorkerRequest['type']>(type: T) {
    return this.received.filter((m): m is Extract<AdjustWorkerRequest, { type: T }> => m.type === type);
  }
}

const bitmap = () => ({ close: vi.fn(), width: 1, height: 1 }) as unknown as ImageBitmap;
const rendered = (seq: number, b: ImageBitmap = bitmap()) =>
  ({ type: 'rendered', seq, bitmap: b, ms: 1 }) as const satisfies AdjustWorkerResponse;
const adj = (exposure: number) => ({ ...DEFAULT_ADJUSTMENTS, exposure });

let client: AdjustPreviewClient;
const worker = () => FakeWorker.instance!;

beforeEach(() => {
  FakeWorker.instance = null;
  vi.stubGlobal('Worker', FakeWorker);
  client = new AdjustPreviewClient();
});
afterEach(() => {
  client.dispose();
  vi.unstubAllGlobals();
});

describe('load', () => {
  it('resolves with the size the worker reports for THAT load', async () => {
    const promise = client.load(bitmap());
    const [sent] = worker().sent('load');
    worker().reply({ type: 'loaded', loadId: sent!.loadId, width: 120, height: 90 });
    await expect(promise).resolves.toEqual({ width: 120, height: 90 });
  });

  it('regression: when image B replaces image A before A finished loading, A’s reply never answers B', async () => {
    const first = client.load(bitmap());
    const second = client.load(bitmap());
    const [a, b] = worker().sent('load');
    expect(a!.loadId).not.toBe(b!.loadId);

    // The worker answers in order: A first (64×64), then B (120×90).
    worker().reply({ type: 'loaded', loadId: a!.loadId, width: 64, height: 64 });
    worker().reply({ type: 'loaded', loadId: b!.loadId, width: 120, height: 90 });

    await expect(first).rejects.toThrow('Superseded');
    await expect(second).resolves.toEqual({ width: 120, height: 90 }); // not 64×64
  });

  it('a load error rejects only the load it belongs to', async () => {
    const first = client.load(bitmap());
    first.catch(() => undefined);
    const second = client.load(bitmap());
    const [a, b] = worker().sent('load');
    worker().reply({ type: 'error', seq: null, loadId: a!.loadId, message: 'decode failed' });
    worker().reply({ type: 'loaded', loadId: b!.loadId, width: 10, height: 10 });
    await expect(second).resolves.toEqual({ width: 10, height: 10 });
  });
});

describe('render: latest value wins', () => {
  it('sends one render at a time and coalesces everything queued behind it to the newest request', async () => {
    const results = [0.1, 0.2, 0.3, 0.4, 0.5].map((value) => client.render(adj(value)));

    // Only the first went out; 0.2–0.4 were superseded by 0.5 while it was in flight.
    expect(
      worker()
        .sent('render')
        .map((m) => m.adjustments.exposure),
    ).toEqual([0.1]);
    worker().reply(rendered(worker().sent('render')[0]!.seq));
    expect(
      worker()
        .sent('render')
        .map((m) => m.adjustments.exposure),
    ).toEqual([0.1, 0.5]);
    worker().reply(rendered(worker().sent('render')[1]!.seq));

    const settled = await Promise.all(results);
    expect(settled.map((r) => r !== null)).toEqual([true, false, false, false, true]);
  });

  it('closes a bitmap that arrives for a request nobody is waiting for any more', async () => {
    void client.render(adj(1));
    const stale = bitmap();
    worker().reply(rendered(999, stale)); // unknown seq
    expect(stale.close).toHaveBeenCalledTimes(1);
  });

  it('a render error resolves null and the next request still goes out', async () => {
    const first = client.render(adj(1));
    const second = client.render(adj(2));
    worker().reply({ type: 'error', seq: worker().sent('render')[0]!.seq, loadId: null, message: 'boom' });
    await expect(first).resolves.toBeNull();
    expect(
      worker()
        .sent('render')
        .map((m) => m.adjustments.exposure),
    ).toEqual([1, 2]);
    worker().reply(rendered(worker().sent('render')[1]!.seq));
    await expect(second).resolves.not.toBeNull();
  });

  it('loading a new image drops a render that was still waiting for the old one', async () => {
    void client.render(adj(1)); // in flight
    const waiting = client.render(adj(2)); // queued behind it
    void client.load(bitmap()).catch(() => undefined);
    await expect(waiting).resolves.toBeNull();
  });
});

describe('failure and disposal', () => {
  it('a worker crash rejects the pending load and resolves waiting renders with null', async () => {
    const load = client.load(bitmap());
    const render = client.render(adj(1));
    worker().onerror?.();
    await expect(load).rejects.toThrow();
    await expect(render).resolves.toBeNull();
  });

  it('dispose terminates the worker', () => {
    void client.render(adj(1));
    client.dispose();
    expect(worker().terminated).toBe(true);
  });
});
