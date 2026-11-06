import 'server-only';

import path from 'node:path';

import { type Limits, resolveLimits } from '@/lib/config/limits';

export type ServerConfig = {
  limits: Limits;
  /** Root for the SQLite DB, stored files, and temp uploads. */
  storageDir: string;
  secureCookies: boolean;
};

/** Read configuration from the environment (SKILLS.md §D.12). Throws on malformed limit values. */
export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): ServerConfig {
  return {
    limits: resolveLimits(env),
    // Runtime deployment configuration, not project source: tell Turbopack not to trace the whole project into
    // the server output because of this path (it would bloat deployments).
    storageDir: path.resolve(/*turbopackIgnore: true*/ env.FS_STORAGE_DIR?.trim() || '.data/storage'),
    secureCookies: env.NODE_ENV === 'production',
  };
}
