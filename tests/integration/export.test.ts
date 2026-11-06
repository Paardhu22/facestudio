// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { fromBuffer, type Entry } from 'yauzl';

import { buildCrop, DEFAULT_FRAMING } from '@/lib/cropping/build';
import { FREE_ASPECT } from '@/lib/cropping/aspect';
import { DEFAULT_OUTPUT } from '@/lib/cropping/output';
import { DEFAULT_ADJUSTMENTS } from '@/lib/image-processing/adjustment-spec';
import { resolveLimits } from '@/lib/config/limits';
import type { ImageEdit, SessionId, SourceImage } from '@/types/domain';
import { createContext, type ServerContext } from '@server/context';
import { createSession } from '@server/session';
import { ingestImage } from '@server/images/ingest';
import { listEdits, saveEdits } from '@server/edits/repository';
import { createJob, getJob, cancelJob, retryJob } from '@server/jobs/repository';
import { claimItem, finishItem, claimPackaging, recoverLeases } from '@server/jobs/queue';
import { packageJob, sweepExports } from '@server/jobs/archive';
import { downloadArtifact } from '@server/jobs/download';
import { renderImage } from '@server/processing/render';
import { originalKey } from '@server/images/repository';
import { createRenderSlot } from '@server/worker/pool';

let dir: string, ctx: ServerContext, owner: SessionId;
const neutral: ImageEdit = { adjustments: DEFAULT_ADJUSTMENTS, crop: null, output: null };
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'facestudio-export-'));
  ctx = createContext({ storageDir: dir, secureCookies: false, limits: resolveLimits({}) });
  owner = createSession(ctx).sessionId;
});
afterEach(async () => {
  ctx.db.close();
  await rm(dir, { recursive: true, force: true });
});
async function add(name = 'photo.png', data?: Buffer): Promise<SourceImage> {
  const bytes =
    data ??
    (await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 128, g: 80, b: 40, alpha: 1 } } })
      .png()
      .toBuffer());
  return ingestImage(ctx, {
    sessionId: owner,
    body: Readable.from([bytes]),
    declaredLength: bytes.length,
    filename: name,
    relativePath: `team/${name}`,
  });
}
async function zipEntries(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) =>
    fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error);
        return;
      }
      const files = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry: Entry) =>
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            reject(err);
            return;
          }
          void buffer(stream)
            .then((data) => {
              files.set(entry.fileName, data);
              zip.readEntry();
            })
            .catch(reject);
        }),
      );
      zip.readEntry();
    }),
  );
}
async function processJob() {
  for (let task = claimItem(ctx); task; task = claimItem(ctx)) {
    await renderImage(ctx.config, task.sessionId, task.image, task.edit, task.outputKey);
    expect(finishItem(ctx, task, true)).toBe(true);
  }
  const pack = claimPackaging(ctx);
  if (pack) await packageJob(ctx, pack);
}
async function pixels(key: string) {
  return sharp(await buffer(ctx.storage.read(key)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

describe('durable export pipeline', () => {
  it('snapshots unsaved on-screen edits, applies the preview math at original resolution, and builds a real ZIP', async () => {
    const image = await add();
    const edit = {
      ...neutral,
      adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: 1 },
      output: { ...DEFAULT_OUTPUT, format: 'png' as const },
    };
    const job = createJob(ctx, owner, { items: [{ id: image.id, ...edit }], preserveFolders: true });
    saveEdits(ctx, owner, [{ id: image.id, ...neutral }]); // subsequent save must never alter a queued export
    await processJob();
    const ready = getJob(ctx, owner, job.id);
    expect(ready.status).toBe('completed');
    expect(ready.artifact?.fileCount).toBe(1);
    const response = await downloadArtifact(ctx, owner, ready.artifact!.id, new Request('http://local/download'));
    const files = await zipEntries(Buffer.from(await response.arrayBuffer()));
    expect([...files.keys()]).toEqual(['team/photo.png']);
    const result = await sharp(files.get('team/photo.png')!).raw().toBuffer({ resolveWithObject: true });
    expect(result.info.width).toBe(120);
    expect(result.info.height).toBe(80);
    // Independent IEC 61966-2-1 reference: +1 EV doubles linear light.
    const v = 128 / 255;
    const linear = ((v + 0.055) / 1.055) ** 2.4;
    const expected = Math.round((1.055 * (linear * 2) ** (1 / 2.4) - 0.055) * 255);
    expect(Math.abs(result.data[0]! - expected)).toBeLessThanOrEqual(1);
  });
  it.each(['circle', 'hexagon'] as const)(
    'exports %s masks through saved snapshots with transparent PNG/WebP and flattened JPEG',
    async (shape) => {
      const image = await add();
      const built = buildCrop({
        image,
        mode: 'custom',
        shape,
        aspect: FREE_ASPECT,
        framing: DEFAULT_FRAMING,
        faces: null,
        faceId: null,
        previous: null,
      });
      if (!built.ok) throw new Error('Expected crop');
      saveEdits(ctx, owner, [{ id: image.id, ...neutral, crop: built.crop }]);
      expect(listEdits(ctx, owner)[image.id]!.crop!.shape).toBe(shape);
      for (const format of ['png', 'webp', 'jpeg'] as const) {
        const job = createJob(ctx, owner, {
          items: [
            { id: image.id, ...neutral, crop: built.crop, output: { ...DEFAULT_OUTPUT, format, padColor: '#204060' } },
          ],
          preserveFolders: false,
        });
        const task = claimItem(ctx)!;
        expect(task.edit.crop!.shape).toBe(shape);
        await renderImage(ctx.config, owner, image, task.edit, task.outputKey);
        expect(finishItem(ctx, task, true)).toBe(true);
        const result = await pixels(task.outputKey);
        const alpha = (x: number, y: number) => result.data[(y * result.info.width + x) * 4 + 3];
        expect(alpha(0, 0)).toBe(format === 'jpeg' ? 255 : 0);
        expect(alpha(Math.floor(result.info.width / 2), Math.floor(result.info.height / 2))).toBe(255);
        if (format === 'jpeg') {
          expect(Math.abs(result.data[0]! - 32)).toBeLessThan(5);
          expect(Math.abs(result.data[1]! - 64)).toBeLessThan(5);
        } else {
          // At least one edge pixel has fractional coverage: curves/polygons are antialiased.
          expect(result.data.some((v, i) => i % 4 === 3 && v > 0 && v < 255)).toBe(true);
        }
        await processJob();
        expect(getJob(ctx, owner, job.id)!.totals.done).toBe(1);
      }
    },
  );
  it('masks before output padding and trims the original shape with cover instead of drawing a new circle', async () => {
    const image = await add();
    const built = buildCrop({
      image,
      mode: 'custom',
      shape: 'circle',
      aspect: FREE_ASPECT,
      framing: DEFAULT_FRAMING,
      faces: null,
      faceId: null,
      previous: null,
    });
    if (!built.ok) throw new Error('Expected crop');
    for (const fit of ['cover', 'pad', 'stretch', 'inside'] as const) {
      const key = `test/shape-${fit}`;
      await renderImage(
        ctx.config,
        owner,
        image,
        {
          ...neutral,
          crop: built.crop,
          output: {
            ...DEFAULT_OUTPUT,
            format: 'png',
            resize: { mode: 'exact', width: 80, height: 40, fit },
            allowUpscale: true,
            padColor: '#204060',
          },
        },
        key,
      );
      const result = await pixels(key);
      const at = (x: number, y: number) => [
        ...result.data.subarray((y * result.info.width + x) * 4, (y * result.info.width + x) * 4 + 4),
      ];
      if (fit === 'pad') {
        expect(at(0, 0)).toEqual([32, 64, 96, 255]);
        expect(at(20, 0)[3]).toBe(0);
      } else expect(at(0, 0)[3]).toBe(0);
      const topCenterAlpha = at(Math.floor(result.info.width / 2), 0)[3]!;
      if (fit === 'cover') expect(topCenterAlpha).toBe(255);
      else if (fit !== 'pad') expect(topCenterAlpha).toBeGreaterThan(100);
    }
  });
  it('renders exact crop pixels before resizing and honors EXIF orientation', async () => {
    const original = await sharp({
      create: { width: 80, height: 120, channels: 3, background: { r: 20, g: 160, b: 70 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const image = await add('rotated.jpg', original);
    expect(image.width).toBe(120);
    expect(image.height).toBe(80);
    const crop = {
      id: 'crp_1234567890123456789012' as const,
      mode: 'custom' as const,
      rect: { x: 90, y: 10, width: 20, height: 40 },
      aspect: { preset: 'free' as const, value: null },
      faceId: null,
      framing: { faceFill: 0.42, headroom: 0.18, padding: 0.25 },
      manual: true,
      constrained: false,
      label: null,
    };
    await renderImage(
      ctx.config,
      owner,
      image,
      { ...neutral, crop, output: { ...DEFAULT_OUTPUT, format: 'png', resize: { mode: 'width', width: 10 } } },
      'test/crop',
    );
    const result = await pixels('test/crop');
    expect(result.info.width).toBe(10);
    expect(result.info.height).toBe(20);
    expect(result.data[1]).toBeGreaterThan(150);
  });
  it('keeps pad colors independent of adjustments and preserves transparency for PNG/WebP', async () => {
    const image = await add();
    await renderImage(
      ctx.config,
      owner,
      image,
      {
        ...neutral,
        adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: 1 },
        output: {
          ...DEFAULT_OUTPUT,
          format: 'png',
          resize: { mode: 'exact', width: 120, height: 120, fit: 'pad' },
          padColor: '#204060',
        },
      },
      'test/pad',
    );
    const result = await pixels('test/pad');
    expect(result.info.width).toBe(120);
    expect(result.info.height).toBe(120);
    expect([...result.data.subarray(0, 4)]).toEqual([32, 64, 96, 255]);
    expect(result.data[30 * 120 * 4]).toBeGreaterThan(128);
    const alpha = await add(
      'alpha.png',
      await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .png()
        .toBuffer(),
    );
    for (const format of ['png', 'webp'] as const) {
      await renderImage(
        ctx.config,
        owner,
        alpha,
        { ...neutral, output: { ...DEFAULT_OUTPUT, format } },
        `test/${format}`,
      );
      expect((await pixels(`test/${format}`)).data[3]).toBe(0);
    }
    await renderImage(
      ctx.config,
      owner,
      alpha,
      { ...neutral, output: { ...DEFAULT_OUTPUT, format: 'jpeg', padColor: '#FFFFFF' } },
      'test/jpg',
    );
    expect([...(await pixels('test/jpg')).data.subarray(0, 3)]).toEqual([255, 255, 255]);
  });
  it.each(['inside', 'cover', 'pad', 'stretch'] as const)(
    'matches the documented exact output for %s without silent upscaling',
    async (fit) => {
      const image = await add();
      await renderImage(
        ctx.config,
        owner,
        image,
        {
          ...neutral,
          output: { ...DEFAULT_OUTPUT, format: 'png', resize: { mode: 'exact', width: 240, height: 240, fit } },
        },
        'test/size',
      );
      const result = await pixels('test/size');
      const expected = fit === 'inside' ? [120, 80] : fit === 'cover' ? [80, 80] : [240, 240];
      expect([result.info.width, result.info.height]).toEqual(expected);
    },
  );
  it('runs the full renderer in a real reusable worker thread', async () => {
    const image = await add();
    createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false });
    const task = claimItem(ctx)!;
    const slot = createRenderSlot(ctx.config);
    try {
      expect(await slot.render(task)).toBe(true);
      expect((await ctx.storage.stat(task.outputKey))?.size).toBeGreaterThan(0);
    } finally {
      await slot.close();
    }
  });
  it('retains queued snapshots across a database close/reopen', async () => {
    const image = await add();
    const job = createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false });
    const config = ctx.config;
    ctx.db.close();
    ctx = createContext(config);
    expect(getJob(ctx, owner, job.id).status).toBe('queued');
    await processJob();
    expect(getJob(ctx, owner, job.id).artifact?.fileCount).toBe(1);
  });
  it('packages successful images when another fails and retries only the failure', async () => {
    ctx.limits.maxAttempts = 1;
    const a = await add('a.png'),
      b = await add('b.png');
    const original = await buffer(ctx.storage.read(originalKey(owner, b.id)));
    await ctx.storage.delete(originalKey(owner, b.id));
    const job = createJob(ctx, owner, {
      items: [
        { id: a.id, ...neutral },
        { id: b.id, ...neutral },
      ],
      preserveFolders: false,
    });
    const good = claimItem(ctx)!;
    await renderImage(ctx.config, owner, good.image, good.edit, good.outputKey);
    finishItem(ctx, good, true);
    const bad = claimItem(ctx)!;
    finishItem(ctx, bad, false);
    await packageJob(ctx, claimPackaging(ctx)!);
    const partial = getJob(ctx, owner, job.id);
    expect(partial.status).toBe('completed_with_errors');
    expect(partial.artifact?.fileCount).toBe(1);
    expect(partial.errors[0]?.filename).toBe('b.png');
    await ctx.storage.writeFile(originalKey(owner, b.id), original);
    await retryJob(ctx, owner, job.id);
    expect(getJob(ctx, owner, job.id).totals.done).toBe(1);
    await processJob();
    const complete = getJob(ctx, owner, job.id);
    expect(complete.status).toBe('completed');
    expect(complete.artifact?.fileCount).toBe(2);
  });
  it('does not publish a ZIP when cancellation happens during packaging', async () => {
    const image = await add();
    const job = createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false });
    const task = claimItem(ctx)!;
    await renderImage(ctx.config, owner, task.image, task.edit, task.outputKey);
    finishItem(ctx, task, true);
    const pack = claimPackaging(ctx)!;
    cancelJob(ctx, owner, job.id);
    await packageJob(ctx, pack);
    const cancelled = getJob(ctx, owner, job.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.artifact).toBeNull();
  });
  it('exports original dimensions even when the preview is downscaled', async () => {
    const image = await add(
      'large.png',
      await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 30, g: 90, b: 150 } } })
        .png()
        .toBuffer(),
    );
    expect(image.renditions.preview.width).toBeLessThan(image.width);
    await renderImage(ctx.config, owner, image, neutral, 'test/full-resolution');
    const result = await sharp(await buffer(ctx.storage.read('test/full-resolution'))).metadata();
    expect([result.width, result.height]).toEqual([4000, 3000]);
  });
  it('rejects oversized output pixels before queueing any work', async () => {
    const image = await add();
    ctx.limits.maxImagePixels = 100_000;
    expect(() =>
      createJob(ctx, owner, {
        items: [
          {
            id: image.id,
            ...neutral,
            output: {
              ...DEFAULT_OUTPUT,
              allowUpscale: true,
              resize: { mode: 'exact', width: 400, height: 400, fit: 'stretch' },
            },
          },
        ],
        preserveFolders: false,
      }),
    ).toThrow('too many pixels');
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 0 });
  });
  it('enforces session ownership and one active job, and rolls back a mixed foreign-image request', async () => {
    const image = await add();
    const other = createSession(ctx).sessionId;
    expect(() => createJob(ctx, other, { items: [{ id: image.id, ...neutral }], preserveFolders: false })).toThrow(
      'no longer available',
    );
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 0 });
    const job = createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false });
    expect(() => getJob(ctx, other, job.id)).toThrow('not found');
    expect(() => createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false })).toThrow(
      'already in progress',
    );
  });
  it('cancels queued items, lets an in-flight item finish, and never publishes a cancelled ZIP', async () => {
    const a = await add('a.png'),
      b = await add('b.png');
    const job = createJob(ctx, owner, {
      items: [
        { id: a.id, ...neutral },
        { id: b.id, ...neutral },
      ],
      preserveFolders: false,
    });
    const task = claimItem(ctx)!;
    expect(cancelJob(ctx, owner, job.id).status).toBe('cancelling');
    expect(claimItem(ctx)).toBeNull();
    finishItem(ctx, task, true);
    const cancelled = getJob(ctx, owner, job.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.totals.cancelled).toBe(1);
    expect(claimPackaging(ctx)).toBeNull();
    expect(cancelled.artifact).toBeNull();
  });
  it('recovers expired leases and rejects stale worker completion before allowing retry of a failed item', async () => {
    ctx.limits.maxAttempts = 1;
    const image = await add();
    const job = createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false });
    const task = claimItem(ctx, 0)!;
    recoverLeases(ctx, 61_000);
    expect(finishItem(ctx, task, true)).toBe(false);
    claimPackaging(ctx);
    expect(getJob(ctx, owner, job.id).status).toBe('failed');
    expect((await retryJob(ctx, owner, job.id)).status).toBe('queued');
    await processJob();
    expect(getJob(ctx, owner, job.id).status).toBe('completed');
  });
  it('supports private, resumable downloads, rejects foreign/expired access, and sweeps old output', async () => {
    const image = await add();
    const job = createJob(ctx, owner, { items: [{ id: image.id, ...neutral }], preserveFolders: false });
    await processJob();
    const ready = getJob(ctx, owner, job.id);
    const full = await downloadArtifact(ctx, owner, ready.artifact!.id, new Request('http://local/download'));
    const bytes = Buffer.from(await full.arrayBuffer());
    const range = await downloadArtifact(
      ctx,
      owner,
      ready.artifact!.id,
      new Request('http://local/download', { headers: { range: 'bytes=0-9' } }),
    );
    expect(range.status).toBe(206);
    expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(0, 10));
    expect(range.headers.get('cache-control')).toBe('private, no-store');
    const bad = await downloadArtifact(
      ctx,
      owner,
      ready.artifact!.id,
      new Request('http://local/download', { headers: { range: 'bytes=999999999-' } }),
    );
    expect(bad.status).toBe(416);
    await expect(
      downloadArtifact(ctx, createSession(ctx).sessionId, ready.artifact!.id, new Request('http://local/download')),
    ).rejects.toThrow('unavailable');
    ctx.db.prepare("UPDATE artifacts SET expires_at='2000-01-01'").run();
    await expect(
      downloadArtifact(ctx, owner, ready.artifact!.id, new Request('http://local/download')),
    ).rejects.toThrow('expired');
    await sweepExports(ctx);
    expect(getJob(ctx, owner, job.id).artifact).toBeNull();
  });
});
