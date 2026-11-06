import 'server-only';

import type { DetectedFace, DetectionResult, ImageId, SessionId } from '@/types/domain';

import type { ServerContext } from '../context';
import { withTransaction } from '../db';

/**
 * Cached face-detection results (SKILLS.md §C.7). Face DETECTION only: boxes and landmark points, never an identity or an
 * embedding. Results are keyed by image and model, so they are computed once and reused across reloads.
 */

type Row = { image_id: string; model_id: string; status: string; faces: string };

export function listDetections(ctx: ServerContext, sessionId: SessionId): Record<ImageId, DetectionResult> {
  const rows = ctx.db
    .prepare('SELECT image_id, model_id, status, faces FROM detections WHERE session_id = ?')
    .all(sessionId) as Row[];
  const out: Record<string, DetectionResult> = {};
  for (const row of rows) {
    try {
      out[row.image_id] = {
        modelId: row.model_id,
        status: row.status as DetectionResult['status'],
        faces: JSON.parse(row.faces) as DetectedFace[],
      };
    } catch {
      // A corrupt row is skipped, so the image is simply detected again.
    }
  }
  return out;
}

const OWNED_CHUNK = 400;

/** Clamp a face box to the image so a bad client can never store geometry outside it. */
function clampFace(face: DetectedFace, width: number, height: number): DetectedFace {
  const x = Math.min(Math.max(face.box.x, 0), Math.max(0, width - 1));
  const y = Math.min(Math.max(face.box.y, 0), Math.max(0, height - 1));
  return {
    ...face,
    box: { x, y, width: Math.min(face.box.width, width - x), height: Math.min(face.box.height, height - y) },
  };
}

/** Store results for the caller's images (others are ignored). Returns how many were stored. */
export function saveDetections(
  ctx: ServerContext,
  sessionId: SessionId,
  items: readonly { id: string; result: DetectionResult }[],
  now = new Date(),
): number {
  const sizes = new Map<string, { width: number; height: number }>();
  for (let start = 0; start < items.length; start += OWNED_CHUNK) {
    const chunk = items.slice(start, start + OWNED_CHUNK).map((item) => item.id);
    const rows = ctx.db
      .prepare(
        `SELECT id, width, height FROM images WHERE session_id = ? AND id IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(sessionId, ...chunk) as { id: string; width: number; height: number }[];
    for (const row of rows) sizes.set(row.id, { width: row.width, height: row.height });
  }

  const upsert = ctx.db.prepare(
    `INSERT INTO detections (image_id, session_id, model_id, status, faces, detected_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (image_id) DO UPDATE SET model_id = excluded.model_id, status = excluded.status,
       faces = excluded.faces, detected_at = excluded.detected_at`,
  );
  const timestamp = now.toISOString();
  let stored = 0;
  withTransaction(ctx.db, () => {
    for (const item of items) {
      const size = sizes.get(item.id);
      if (!size) continue;
      const faces = item.result.faces.map((face) => clampFace(face, size.width, size.height));
      const status = item.result.status === 'complete' && faces.length === 0 ? 'no_face' : item.result.status;
      upsert.run(item.id, sessionId, item.result.modelId, status, JSON.stringify(faces), timestamp);
      stored += 1;
    }
  });
  return stored;
}
