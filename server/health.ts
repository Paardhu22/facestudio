import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';

export type HealthReport = {
  ok: boolean;
  checks: { sqlite: boolean; sharp: boolean };
};

/**
 * Verifies that the built-in SQLite module and the sharp native module load and work inside
 * the running server (SKILLS.md §E-12). Returns booleans only: no versions or error details.
 */
export async function runHealthChecks(): Promise<HealthReport> {
  const checks = { sqlite: false, sharp: false };

  try {
    const db = new DatabaseSync(':memory:');
    const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    db.close();
    checks.sqlite = row?.ok === 1;
  } catch {
    checks.sqlite = false;
  }

  try {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000000' } })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    checks.sharp = meta.width === 2 && meta.height === 2;
  } catch {
    checks.sharp = false;
  }

  return { ok: checks.sqlite && checks.sharp, checks };
}
