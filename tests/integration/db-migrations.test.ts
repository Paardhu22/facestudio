// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrate, openDatabase, SCHEMA_VERSION } from '@server/db';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'facestudio-db-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const version = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const tables = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);

describe('database migrations', () => {
  it('a new database is created at the current schema version with every table', () => {
    const db = openDatabase(':memory:');
    expect(version(db)).toBe(SCHEMA_VERSION);
    expect(tables(db)).toEqual(
      expect.arrayContaining(['sessions', 'images', 'image_edits', 'detections', 'jobs', 'job_items', 'artifacts']),
    );
    db.close();
  });

  it('upgrades a version-1 database in place, keeping existing data', () => {
    const file = path.join(dir, 'v1.db');
    const db = openDatabase(file);
    db.prepare('INSERT INTO sessions (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(
      'ses_x',
      'h',
      't',
      't',
    );
    // Simulate a database created by the first release: only sessions and images, user_version 1.
    db.exec(
      'DROP TABLE artifacts; DROP TABLE job_items; DROP TABLE jobs; DROP TABLE detections; DROP TABLE image_edits; PRAGMA user_version = 1;',
    );
    expect(tables(db)).not.toContain('image_edits');
    expect(tables(db)).not.toContain('detections');

    migrate(db);

    expect(version(db)).toBe(SCHEMA_VERSION);
    expect(tables(db)).toEqual(expect.arrayContaining(['image_edits', 'detections']));
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
    db.close();
  });

  it('upgrades a version-2 database: existing edits survive and gain the crop and output columns', () => {
    const db = openDatabase(':memory:');
    db.prepare('INSERT INTO sessions (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(
      'ses_x',
      'h',
      't',
      't',
    );
    db.prepare(
      `INSERT INTO images (id, session_id, filename, mime_type, byte_size, width, height, orientation, has_alpha, content_hash,
         thumb_width, thumb_height, preview_width, preview_height, created_at)
       VALUES ('img_a', 'ses_x', 'a.jpg', 'image/jpeg', 1, 10, 10, 1, 0, 'h', 10, 10, 10, 10, 't')`,
    ).run();
    // Rebuild image_edits exactly as release 2 had it (no crop/output columns) and drop what release 3 added.
    db.exec(`DROP TABLE artifacts; DROP TABLE job_items; DROP TABLE jobs; DROP TABLE detections; DROP TABLE image_edits;
      CREATE TABLE image_edits (image_id TEXT PRIMARY KEY REFERENCES images (id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE, adjustments TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO image_edits VALUES ('img_a', 'ses_x', '{"exposure":1}', 't');
      PRAGMA user_version = 2;`);

    migrate(db);

    expect(version(db)).toBe(SCHEMA_VERSION);
    expect(db.prepare('SELECT adjustments, crop, output FROM image_edits').get()).toEqual({
      adjustments: '{"exposure":1}',
      crop: null,
      output: null,
    });
    expect(tables(db)).toContain('detections');
    db.close();
  });

  it('is idempotent: migrating an up-to-date database changes nothing', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    migrate(db);
    expect(version(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('reopening an existing file does not re-run migrations or lose data', () => {
    const file = path.join(dir, 'reopen.db');
    const first = openDatabase(file);
    first
      .prepare('INSERT INTO sessions (id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
      .run('ses_y', 'h2', 't', 't');
    first.close();
    const second = openDatabase(file);
    expect(second.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
    second.close();
  });
});
