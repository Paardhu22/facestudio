import 'server-only';

import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Storage abstraction (SKILLS.md §C.9). The local-disk driver is the MVP; a multi-host deployment
 * needs an object-storage driver behind this same interface.
 *
 * Keys are SERVER-GENERATED (`sessions/<id>/originals/<id>`); user input never becomes part of a key.
 * Keys are still validated here as defense in depth against path traversal.
 */
export type StorageDriver = {
  writeFile(key: string, data: Buffer): Promise<void>;
  /** Move a local file (for example a finished temp upload) into storage. */
  adopt(localPath: string, key: string): Promise<void>;
  read(key: string, range?: { start: number; end: number }): Readable;
  stat(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  /** A fresh, unique path for in-progress uploads. The directory exists. */
  createTempPath(): Promise<string>;
  /** Remove temp files older than `maxAgeMs` (crashed uploads). Returns the number removed. */
  sweepTemp(maxAgeMs: number): Promise<number>;
};

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export function assertValidKey(key: string): void {
  const segments = key.split('/');
  if (key.length === 0 || key.length > 512 || segments.some((segment) => !SEGMENT.test(segment) || segment === '..')) {
    throw new Error('Invalid storage key');
  }
}

export function createLocalStorage(rootDir: string): StorageDriver {
  const root = path.resolve(rootDir);
  const filesRoot = path.join(root, 'files');
  const tempRoot = path.join(root, 'tmp');

  function resolveKey(key: string): string {
    assertValidKey(key);
    const resolved = path.join(filesRoot, ...key.split('/'));
    if (!resolved.startsWith(filesRoot + path.sep)) throw new Error('Invalid storage key');
    return resolved;
  }

  return {
    async writeFile(key, data) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data);
    },
    async adopt(localPath, key) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(localPath, target);
    },
    read(key, range) {
      return createReadStream(resolveKey(key), range);
    },
    async stat(key) {
      try {
        const info = await stat(resolveKey(key));
        return info.isFile() ? { size: info.size } : null;
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
    async deletePrefix(prefix) {
      await rm(resolveKey(prefix), { recursive: true, force: true });
    },
    async createTempPath() {
      await mkdir(tempRoot, { recursive: true });
      return path.join(tempRoot, `upload-${randomBytes(12).toString('hex')}`);
    },
    async sweepTemp(maxAgeMs) {
      let removed = 0;
      let names: string[];
      try {
        names = await readdir(tempRoot);
      } catch {
        return 0;
      }
      const cutoff = Date.now() - maxAgeMs;
      for (const name of names) {
        const file = path.join(tempRoot, name);
        try {
          const info = await stat(file);
          if (info.mtimeMs < cutoff) {
            await rm(file, { force: true });
            removed += 1;
          }
        } catch {
          // Raced with another cleanup; ignore.
        }
      }
      return removed;
    },
  };
}
