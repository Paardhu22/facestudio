import { sanitizeDisplayName, sanitizeRelativePath } from '@/lib/validation/filenames';
import type { ImageEdit, OutputSettings, SourceImage } from '@/types/domain';

export function exportFormat(image: Pick<SourceImage, 'mimeType'>, output: OutputSettings): 'jpeg' | 'png' | 'webp' {
  return output.format === 'source'
    ? image.mimeType === 'image/jpeg'
      ? 'jpeg'
      : image.mimeType === 'image/png'
        ? 'png'
        : 'webp'
    : output.format;
}

/** Names are archive metadata only; physical output keys always use random IDs. */
export function exportFilename(
  image: Pick<SourceImage, 'originalFilename' | 'relativePath' | 'mimeType'>,
  edit: ImageEdit,
  output: OutputSettings,
  size: { width: number; height: number },
  preserveFolders: boolean,
  used: Set<string>,
): string {
  const base = image.originalFilename.replace(/\.[^.]+$/, '') || 'image';
  const values: Record<string, string> = {
    name: base,
    n: '1',
    w: String(size.width),
    h: String(size.height),
    mode: edit.crop?.mode ?? 'original',
  };
  const rendered = output.filenameTemplate.replace(/\{(name|n|w|h|mode)\}/g, (_, key: string) => values[key] ?? '');
  // Keep names portable across operating systems and prevent drive-letter paths in ZIP entries.
  const safe = (name: string) =>
    sanitizeDisplayName(name)
      .replace(/[<>:"|?*]/g, '_')
      .replace(/[. ]+$/, '') || 'image';
  const name = safe(rendered).slice(0, 160);
  const folder =
    preserveFolders && image.relativePath
      ? sanitizeRelativePath(image.relativePath)?.split('/').slice(0, -1).map(safe).join('/')
      : '';
  const prefix = folder ? `${folder}/` : '';
  const extension = exportFormat(image, output) === 'jpeg' ? 'jpg' : exportFormat(image, output);
  let candidate = `${prefix}${name}.${extension}`;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase('en-US'))) candidate = `${prefix}${name}_${suffix++}.${extension}`;
  used.add(candidate.toLocaleLowerCase('en-US'));
  return candidate;
}
