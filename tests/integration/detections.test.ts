// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveLimits } from '@/lib/config/limits';
import { FACE_MODEL_ID } from '@/lib/face-detection/constants';
import type { DetectedFace, DetectionResult, SessionId } from '@/types/domain';
import { createContext, type ServerContext } from '@server/context';
import { listDetections, saveDetections } from '@server/detections/repository';
import { ingestImage } from '@server/images/ingest';
import { deleteImages } from '@server/images/repository';
import { createSession, deleteSession } from '@server/session';

import { makeJpeg } from '../fixtures/images';

let dir: string;
let ctx: ServerContext;
let session: SessionId;

const face = (x: number, y: number, width: number, height: number, id: DetectedFace['id'] = 'f0'): DetectedFace => ({
  id,
  box: { x, y, width, height },
  score: 0.93,
  keypoints: { rightEye: { x: x + width * 0.3, y: y + height * 0.4 } },
});
const complete = (...faces: DetectedFace[]): DetectionResult => ({ modelId: FACE_MODEL_ID, status: 'complete', faces });

async function addImage(owner: SessionId = session, width = 100, height = 80): Promise<string> {
  const buffer = await makeJpeg({ width, height });
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
  dir = await mkdtemp(path.join(tmpdir(), 'facestudio-det-'));
  ctx = createContext({ limits: resolveLimits({}), storageDir: dir, secureCookies: false }, ':memory:');
  session = createSession(ctx).sessionId;
});
afterEach(async () => {
  ctx.db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('detection cache', () => {
  it('stores and returns results, including faces with landmarks, keyed by image', async () => {
    const a = await addImage(session, 100, 80);
    const b = await addImage(session, 101, 80);
    expect(
      saveDetections(ctx, session, [
        { id: a, result: complete(face(10, 10, 30, 30), face(50, 20, 20, 25, 'f1')) },
        { id: b, result: { modelId: FACE_MODEL_ID, status: 'no_face', faces: [] } },
      ]),
    ).toBe(2);
    const all = listDetections(ctx, session);
    expect(all[a as never]?.faces).toHaveLength(2);
    expect(all[a as never]?.faces[0]?.keypoints.rightEye).toBeDefined();
    expect(all[b as never]).toEqual({ modelId: FACE_MODEL_ID, status: 'no_face', faces: [] });
  });

  it('overwrites an earlier result (for example after a model change)', async () => {
    const a = await addImage();
    saveDetections(ctx, session, [{ id: a, result: complete(face(10, 10, 30, 30)) }]);
    saveDetections(ctx, session, [
      { id: a, result: { modelId: 'newer-model', status: 'complete', faces: [face(20, 20, 40, 40)] } },
    ]);
    const stored = Object.values(listDetections(ctx, session));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ modelId: 'newer-model' });
  });

  it('a "complete" result with no faces is stored as no_face', async () => {
    const a = await addImage();
    saveDetections(ctx, session, [{ id: a, result: complete() }]);
    expect(Object.values(listDetections(ctx, session))[0]?.status).toBe('no_face');
  });

  it('clamps face boxes to the image so geometry outside it can never be stored', async () => {
    const a = await addImage(session, 100, 80);
    saveDetections(ctx, session, [{ id: a, result: complete(face(70, 60, 200, 200)) }]);
    const box = Object.values(listDetections(ctx, session))[0]?.faces[0]?.box;
    expect(box!.x + box!.width).toBeLessThanOrEqual(100);
    expect(box!.y + box!.height).toBeLessThanOrEqual(80);
  });

  it('ignores images that belong to another session or do not exist, and never leaks results across sessions', async () => {
    const mine = await addImage(session);
    const other = createSession(ctx).sessionId;
    const theirs = await addImage(other);
    const stored = saveDetections(ctx, session, [
      { id: mine, result: complete(face(5, 5, 20, 20)) },
      { id: theirs, result: complete(face(5, 5, 20, 20)) },
      { id: 'img_0000000000000000000000', result: complete(face(5, 5, 20, 20)) },
    ]);
    expect(stored).toBe(1);
    expect(listDetections(ctx, other)).toEqual({});
    expect(Object.keys(listDetections(ctx, session))).toEqual([mine]);
  });

  it('is removed with its image and with its session', async () => {
    const a = await addImage();
    const b = await addImage(session, 101);
    saveDetections(ctx, session, [
      { id: a, result: complete(face(5, 5, 20, 20)) },
      { id: b, result: complete(face(5, 5, 20, 20)) },
    ]);
    await deleteImages(ctx, session, [a]);
    expect(Object.keys(listDetections(ctx, session))).toEqual([b]);
    await deleteSession(ctx, session);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM detections').get()).toEqual({ n: 0 });
  });

  it('skips a corrupt row instead of failing the whole list', async () => {
    const a = await addImage();
    const b = await addImage(session, 101);
    saveDetections(ctx, session, [
      { id: a, result: complete(face(5, 5, 20, 20)) },
      { id: b, result: complete(face(5, 5, 20, 20)) },
    ]);
    ctx.db.prepare('UPDATE detections SET faces = ? WHERE image_id = ?').run('{nope', a);
    expect(Object.keys(listDetections(ctx, session))).toEqual([b]);
  });
});
