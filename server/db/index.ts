import 'server-only';

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA_V1 = `
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_last_seen ON sessions (last_seen_at);

CREATE TABLE images (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  id             TEXT NOT NULL UNIQUE,
  session_id     TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  filename       TEXT NOT NULL,
  relative_path  TEXT,
  mime_type      TEXT NOT NULL,
  byte_size      INTEGER NOT NULL,
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL,
  orientation    INTEGER NOT NULL,
  has_alpha      INTEGER NOT NULL,
  content_hash   TEXT NOT NULL,
  duplicate_of   TEXT,
  thumb_width    INTEGER NOT NULL,
  thumb_height   INTEGER NOT NULL,
  preview_width  INTEGER NOT NULL,
  preview_height INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX images_session_seq ON images (session_id, seq);
CREATE INDEX images_session_hash ON images (session_id, content_hash);
`;

const SCHEMA_V2 = `
CREATE TABLE image_edits (
  image_id    TEXT PRIMARY KEY REFERENCES images (id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  adjustments TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX image_edits_session ON image_edits (session_id);
`;

const SCHEMA_V3 = `
ALTER TABLE image_edits ADD COLUMN crop TEXT;
ALTER TABLE image_edits ADD COLUMN output TEXT;

CREATE TABLE detections (
  image_id    TEXT PRIMARY KEY REFERENCES images (id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  model_id    TEXT NOT NULL,
  status      TEXT NOT NULL,
  faces       TEXT NOT NULL,
  detected_at TEXT NOT NULL
);
CREATE INDEX detections_session ON detections (session_id);
`;

const SCHEMA_V4 = `
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error_message TEXT,
  package_token TEXT,
  package_lease INTEGER
);
CREATE INDEX jobs_session ON jobs(session_id, created_at);
CREATE TABLE job_items (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  source TEXT NOT NULL,
  edit TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER,
  output_key TEXT,
  error_message TEXT
);
CREATE INDEX job_items_queue ON job_items(status, seq);
CREATE INDEX job_items_job ON job_items(job_id);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX artifacts_expiry ON artifacts(expires_at);
`;

/** Migrations run in order; each bumps `PRAGMA user_version`. Never edit a shipped migration. */
const MIGRATIONS: readonly string[] = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4];

/** Number of migrations this build knows about. A cached connection with a lower number needs `migrate` again. */
export const SCHEMA_VERSION = MIGRATIONS.length;

/** Apply any migrations the database has not seen. Idempotent: safe to call on every start and after hot reloads. */
export function migrate(db: Db): void {
  // The web process and export worker may start together. Read the version only
  // after acquiring the write reservation, so neither uses a stale schema version.
  withTransaction(db, () => {
    const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
    for (let version = row.user_version; version < MIGRATIONS.length; version++) {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    }
  });
}

/** Open (and migrate) a SQLite database. `:memory:` is allowed for tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
  );
  migrate(db);
  return db;
}

/** Run `fn` in an IMMEDIATE transaction. The node:sqlite API is synchronous, so the body must be too. */
export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
