import 'server-only';

import path from 'node:path';

import type { Limits } from '@/lib/config/limits';

import { loadConfig, type ServerConfig } from './config';
import { type Db, migrate, openDatabase, SCHEMA_VERSION } from './db';
import { createLocalStorage, type StorageDriver } from './storage/local-driver';

/** Everything server logic needs, passed explicitly so tests can build isolated instances. */
export type ServerContext = {
  db: Db;
  storage: StorageDriver;
  limits: Limits;
  config: ServerConfig;
  /** Mutable bookkeeping for throttled maintenance. */
  state: { lastSweepMs: number; schemaVersion: number };
};

export function createContext(
  config: ServerConfig,
  dbFile = path.join(config.storageDir, 'facestudio.db'),
): ServerContext {
  return {
    db: openDatabase(dbFile),
    storage: createLocalStorage(config.storageDir),
    limits: config.limits,
    config,
    state: { lastSweepMs: 0, schemaVersion: SCHEMA_VERSION },
  };
}

const STALE_TEMP_MS = 60 * 60 * 1000;
const globalKey = Symbol.for('facestudio.server-context');
type GlobalWithContext = typeof globalThis & { [globalKey]?: ServerContext };

/** Process-wide context, preserved across dev-server module reloads. */
export function getContext(): ServerContext {
  const holder = globalThis as GlobalWithContext;
  let context = holder[globalKey];
  if (!context) {
    context = createContext(loadConfig());
    holder[globalKey] = context;
    // Leftover temp files come from uploads interrupted by a crash or restart.
    void context.storage.sweepTemp(STALE_TEMP_MS);
  } else if (context.state.schemaVersion !== SCHEMA_VERSION) {
    // The connection is cached across dev-server hot reloads, so a migration added since it was opened must still run.
    migrate(context.db);
    context.state.schemaVersion = SCHEMA_VERSION;
  }
  return context;
}
