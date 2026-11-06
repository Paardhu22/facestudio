// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveLimits } from '@/lib/config/limits';
import { DEFAULT_ADJUSTMENTS } from '@/lib/image-processing/adjustment-spec';
import { DEFAULT_OUTPUT } from '@/lib/cropping/output';
import type { CropRegion, ImageAdjustments, SessionId } from '@/types/domain';
import { createContext, type ServerContext } from '@server/context';
import { listEdits, saveEdits } from '@server/edits/repository';
import { ingestImage } from '@server/images/ingest';
import { deleteImages } from '@server/images/repository';
import { createSession, deleteSession } from '@server/session';

import { makeJpeg } from '../fixtures/images';

let dir: string;
let ctx: ServerContext;
let session: SessionId;

const adj = (patch: Partial<ImageAdjustments>): ImageAdjustments => ({ ...DEFAULT_ADJUSTMENTS, ...patch });
const edited = (patch: Partial<ImageAdjustments>) => ({ adjustments: adj(patch), crop: null, output: null });

async function addImage(owner: SessionId = session, width = 30): Promise<string> {
  const buffer = await makeJpeg({ width, height: 20 });
  const image = await ingestImage(ctx, {
    sessionId: owner,
    body: Readable.from([buffer]),
    declaredLength: buffer.length,
    filename: 'a.jpg',
    relativePath: null,
  });
  return image.id;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'facestudio-edits-'));
  ctx = createContext({ limits: resolveLimits({}), storageDir: dir, secureCookies: false }, ':memory:');
  session = createSession(ctx).sessionId;
});

afterEach(async () => {
  ctx.db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('edit persistence', () => {
  it('stores only non-default adjustments and returns them keyed by image id', async () => {
    const a = await addImage(session, 30);
    const b = await addImage(session, 31);
    expect(saveEdits(ctx, session, [{ id: a, adjustments: adj({ exposure: 0.5, tint: -10 }) }])).toBe(1);
    expect(listEdits(ctx, session)).toEqual({ [a]: edited({ exposure: 0.5, tint: -10 }) });
    expect(listEdits(ctx, session)[b as never]).toBeUndefined();
  });

  it('updates in place, and a neutral value clears the edit', async () => {
    const a = await addImage();
    saveEdits(ctx, session, [{ id: a, adjustments: adj({ saturation: 40 }) }]);
    saveEdits(ctx, session, [{ id: a, adjustments: adj({ saturation: 55, brightness: 5 }) }]);
    expect(Object.values(listEdits(ctx, session))).toEqual([edited({ saturation: 55, brightness: 5 })]);

    saveEdits(ctx, session, [{ id: a, adjustments: DEFAULT_ADJUSTMENTS }]);
    expect(listEdits(ctx, session)).toEqual({});
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM image_edits').get()).toEqual({ n: 0 });
  });

  it('clamps and snaps stored values to the shared spec', async () => {
    const a = await addImage();
    saveEdits(ctx, session, [{ id: a, adjustments: adj({ exposure: 1.23456, temperature: 12.6, tint: 999 }) }]);
    expect(Object.values(listEdits(ctx, session))[0]).toEqual(edited({ exposure: 1.23, temperature: 13, tint: 100 }));
  });

  it('saves many images in one call', async () => {
    const ids = await Promise.all([30, 31, 32, 33].map((w) => addImage(session, w)));
    const applied = saveEdits(
      ctx,
      session,
      ids.map((id) => ({ id, adjustments: adj({ exposure: 1 }) })),
    );
    expect(applied).toBe(4);
    expect(Object.keys(listEdits(ctx, session))).toHaveLength(4);
  });

  it('ignores unknown ids and images owned by another session, and never exposes them', async () => {
    const mine = await addImage(session, 30);
    const other = createSession(ctx).sessionId;
    const theirs = await addImage(other, 31);

    const applied = saveEdits(ctx, session, [
      { id: mine, adjustments: adj({ exposure: 1 }) },
      { id: theirs, adjustments: adj({ exposure: -2 }) },
      { id: 'img_0000000000000000000000', adjustments: adj({ exposure: 2 }) },
    ]);
    expect(applied).toBe(1);
    expect(listEdits(ctx, other)).toEqual({});
    expect(Object.keys(listEdits(ctx, session))).toEqual([mine]);
    // A stranger's neutral "save" must not delete someone else's edit either.
    saveEdits(ctx, other, [{ id: mine, adjustments: DEFAULT_ADJUSTMENTS }]);
    expect(Object.keys(listEdits(ctx, session))).toEqual([mine]);
  });

  it('removes edits with their image and with their session', async () => {
    const a = await addImage(session, 30);
    const b = await addImage(session, 31);
    saveEdits(ctx, session, [
      { id: a, adjustments: adj({ exposure: 1 }) },
      { id: b, adjustments: adj({ exposure: 2 }) },
    ]);
    await deleteImages(ctx, session, [a]);
    expect(Object.keys(listEdits(ctx, session))).toEqual([b]);
    await deleteSession(ctx, session);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM image_edits').get()).toEqual({ n: 0 });
  });

  it('tolerates a corrupt stored row by treating that image as unedited', async () => {
    const a = await addImage(session, 30);
    const b = await addImage(session, 31);
    saveEdits(ctx, session, [{ id: b, adjustments: adj({ exposure: 1 }) }]);
    ctx.db
      .prepare('INSERT INTO image_edits (image_id, session_id, adjustments, updated_at) VALUES (?, ?, ?, ?)')
      .run(a, session, '{not json', new Date().toISOString());
    expect(Object.keys(listEdits(ctx, session))).toEqual([b]);
  });
});

const cropOf = (rect: { x: number; y: number; width: number; height: number }): CropRegion => ({
  id: 'crp_aaaaaaaaaaaaaaaaaaaaaa',
  mode: 'custom',
  rect,
  aspect: { preset: 'free', value: null },
  faceId: null,
  framing: { faceFill: 0.42, headroom: 0.18, padding: 0.25 },
  manual: true,
  constrained: false,
  label: null,
});

describe('crops and output settings', () => {
  it('stores a crop and output alongside the adjustments', async () => {
    const a = await addImage(session, 200); // 200 × 20
    const output = {
      ...DEFAULT_OUTPUT,
      format: 'webp' as const,
      quality: 80,
      resize: { mode: 'width' as const, width: 100 },
    };
    saveEdits(ctx, session, [
      { id: a, adjustments: DEFAULT_ADJUSTMENTS, crop: cropOf({ x: 10, y: 2, width: 100, height: 16 }), output },
    ]);
    const stored = Object.values(listEdits(ctx, session))[0];
    expect(stored?.crop?.rect).toEqual({ x: 10, y: 2, width: 100, height: 16 });
    expect(stored?.output).toEqual(output);
    expect(stored?.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it('a crop alone (default adjustments, no output) is a non-default edit and is kept', async () => {
    const a = await addImage(session, 200);
    saveEdits(ctx, session, [
      { id: a, adjustments: DEFAULT_ADJUSTMENTS, crop: cropOf({ x: 0, y: 0, width: 50, height: 20 }) },
    ]);
    expect(Object.keys(listEdits(ctx, session))).toEqual([a]);
  });

  it('clamps a crop that extends past the real image, so an invalid crop can never be stored', async () => {
    const a = await addImage(session, 200); // the image is 200 × 20
    saveEdits(ctx, session, [
      { id: a, adjustments: DEFAULT_ADJUSTMENTS, crop: cropOf({ x: 150, y: 10, width: 500, height: 400 }) },
    ]);
    const rect = Object.values(listEdits(ctx, session))[0]?.crop?.rect;
    expect(rect).toBeDefined();
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(200);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(20);
    expect(rect!.width).toBeGreaterThan(0);
  });

  it('uses the EXIF-oriented size for clamping (a 120×60 JPEG with orientation 6 is 60×120)', async () => {
    const buffer = await makeJpeg({ width: 120, height: 60 }, { orientation: 6 });
    const image = await ingestImage(ctx, {
      sessionId: session,
      body: Readable.from([buffer]),
      declaredLength: buffer.length,
      filename: 'r.jpg',
      relativePath: null,
    });
    saveEdits(ctx, session, [
      { id: image.id, adjustments: DEFAULT_ADJUSTMENTS, crop: cropOf({ x: 0, y: 0, width: 120, height: 120 }) },
    ]);
    const rect = Object.values(listEdits(ctx, session))[0]?.crop?.rect;
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(60);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(120);
  });

  it('clamps output sizes to the configured maximum and does not store default output', async () => {
    const a = await addImage(session, 100);
    saveEdits(ctx, session, [
      {
        id: a,
        adjustments: adj({ exposure: 1 }),
        output: { ...DEFAULT_OUTPUT, resize: { mode: 'width', width: 16383 }, quality: 100 },
      },
    ]);
    expect(Object.values(listEdits(ctx, session))[0]?.output?.resize).toEqual({ mode: 'width', width: 16383 });

    saveEdits(ctx, session, [{ id: a, adjustments: adj({ exposure: 1 }), output: { ...DEFAULT_OUTPUT } }]);
    expect(Object.values(listEdits(ctx, session))[0]?.output).toBeNull(); // equal to the defaults → not stored

    saveEdits(ctx, session, [{ id: a, adjustments: DEFAULT_ADJUSTMENTS, crop: null, output: { ...DEFAULT_OUTPUT } }]);
    expect(listEdits(ctx, session)).toEqual({}); // nothing left that differs from the defaults
  });

  it('removing the crop of an otherwise unedited image deletes the row', async () => {
    const a = await addImage(session, 200);
    saveEdits(ctx, session, [
      { id: a, adjustments: DEFAULT_ADJUSTMENTS, crop: cropOf({ x: 0, y: 0, width: 50, height: 20 }) },
    ]);
    saveEdits(ctx, session, [{ id: a, adjustments: DEFAULT_ADJUSTMENTS, crop: null }]);
    expect(listEdits(ctx, session)).toEqual({});
  });

  it('a corrupt stored crop is treated as no crop, not as a failure', async () => {
    const a = await addImage(session, 200);
    saveEdits(ctx, session, [{ id: a, adjustments: adj({ exposure: 1 }) }]);
    ctx.db.prepare('UPDATE image_edits SET crop = ? WHERE image_id = ?').run('{broken', a);
    expect(Object.values(listEdits(ctx, session))[0]).toEqual({
      adjustments: adj({ exposure: 1 }),
      crop: null,
      output: null,
    });
  });
});
