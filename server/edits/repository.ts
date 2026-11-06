import 'server-only';

import { isNeutralAdjustments, normalizeAdjustments } from '@/lib/image-processing/adjustment-spec';
import { normalizeCropShape } from '@/lib/cropping/build';
import { isDefaultOutput, normalizeOutput } from '@/lib/cropping/output';
import type { CropRegion, ImageAdjustments, ImageEdit, ImageId, OutputSettings, SessionId } from '@/types/domain';

import type { ServerContext } from '../context';
import { withTransaction } from '../db';

/**
 * Non-destructive edit instructions (SKILLS.md §C.5, §E-7): adjustments, an optional crop, and optional output settings.
 * Only NON-DEFAULT edits are stored: an image without a row is unedited. Originals are never touched; edits are applied
 * at preview and export time.
 */

type EditRow = { image_id: string; adjustments: string; crop: string | null; output: string | null };

function parse<T>(text: string | null): T | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null; // a corrupt value is treated as "not set" rather than failing the whole list
  }
}

export function listEdits(ctx: ServerContext, sessionId: SessionId): Record<ImageId, ImageEdit> {
  const rows = ctx.db
    .prepare('SELECT image_id, adjustments, crop, output FROM image_edits WHERE session_id = ?')
    .all(sessionId) as EditRow[];
  const edits: Record<string, ImageEdit> = {};
  for (const row of rows) {
    const adjustments = parse<Partial<ImageAdjustments>>(row.adjustments);
    if (adjustments === null) continue;
    edits[row.image_id] = {
      adjustments: normalizeAdjustments(adjustments),
      crop: parse<CropRegion>(row.crop),
      output: parse<OutputSettings>(row.output),
    };
  }
  return edits;
}

export type EditItem = {
  id: string;
  adjustments: ImageAdjustments;
  crop?: CropRegion | null;
  output?: OutputSettings | null;
};

const OWNED_CHUNK = 400;

/**
 * Upsert (or, for fully default edits, delete) edits for the caller's images. Foreign or unknown ids are ignored.
 * Adjustments are re-normalized (clamped, snapped); a crop rectangle is clamped to the image's real, EXIF-oriented size and
 * rounded to integers, so an invalid crop can never be stored; output sizes are clamped to the configured maximum.
 * Returns how many items were applied.
 */
export function saveEdits(
  ctx: ServerContext,
  sessionId: SessionId,
  items: readonly EditItem[],
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

  const timestamp = now.toISOString();
  const upsert = ctx.db.prepare(
    `INSERT INTO image_edits (image_id, session_id, adjustments, crop, output, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (image_id) DO UPDATE SET adjustments = excluded.adjustments, crop = excluded.crop,
       output = excluded.output, updated_at = excluded.updated_at`,
  );
  const remove = ctx.db.prepare('DELETE FROM image_edits WHERE image_id = ? AND session_id = ?');
  const maxSide = ctx.limits.maxOutputSide;

  let applied = 0;
  withTransaction(ctx.db, () => {
    for (const item of items) {
      const image = sizes.get(item.id);
      if (!image) continue;

      const adjustments = normalizeAdjustments(item.adjustments);
      let crop: CropRegion | null = null;
      if (item.crop) {
        crop = normalizeCropShape(item.crop, image);
      }
      const normalizedOutput = item.output ? normalizeOutput(item.output, maxSide) : null;
      const output = normalizedOutput && !isDefaultOutput(normalizedOutput) ? normalizedOutput : null;

      if (isNeutralAdjustments(adjustments) && crop === null && output === null) remove.run(item.id, sessionId);
      else
        upsert.run(
          item.id,
          sessionId,
          JSON.stringify(adjustments),
          crop ? JSON.stringify(crop) : null,
          output ? JSON.stringify(output) : null,
          timestamp,
        );
      applied += 1;
    }
  });
  return applied;
}
