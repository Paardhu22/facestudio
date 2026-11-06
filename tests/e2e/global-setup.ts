import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** Remove storage left by previous e2e runs. The current run's directory is kept. */
export default async function globalSetup(): Promise<void> {
  const base = path.resolve('.data', 'e2e');
  const keep = path.basename(process.env.FS_E2E_STORAGE ?? '');
  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return;
  }
  await Promise.all(
    entries.filter((name) => name !== keep).map((name) => rm(path.join(base, name), { recursive: true, force: true })),
  );
}
