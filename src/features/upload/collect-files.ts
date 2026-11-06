import type { UploadCandidate } from './upload-manager';

/** Turn a file input's selection into upload candidates. Folder picks carry `webkitRelativePath`. */
export function candidatesFromFiles(files: Iterable<File>): UploadCandidate[] {
  return Array.from(files, (file) => ({ file, path: file.webkitRelativePath || null }));
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // `readEntries` returns at most ~100 entries per call; keep calling until it returns none.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, out: UploadCandidate[]): Promise<void> {
  try {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      const path = entry.fullPath.replace(/^\/+/, '');
      out.push({ file, path: path.includes('/') ? path : null });
    } else if (entry.isDirectory) {
      const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
      await Promise.all(children.map((child) => walk(child, out)));
    }
  } catch {
    // An unreadable file or folder (permissions, removed mid-drop) is skipped, not fatal for the rest.
  }
}

/**
 * Collect files from a drop, descending into dropped folders. Entries are captured SYNCHRONOUSLY: the
 * browser invalidates `DataTransfer` items once the drop event handler returns, so nothing may be awaited
 * before the loop below finishes.
 */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<UploadCandidate[]> {
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }

  const out: UploadCandidate[] = loose.map((file) => ({ file, path: null }));
  await Promise.all(entries.map((entry) => walk(entry, out)));
  return out;
}
