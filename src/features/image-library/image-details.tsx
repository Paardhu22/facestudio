'use client';

import { formatBytes, formatCount, pluralize } from '@/lib/format';
import { MIME_LABELS } from '@/lib/validation/image-signature';
import { useLibraryStore } from '@/stores/library-store';
import type { ExifOrientation } from '@/types/domain';

const ORIENTATION_NOTES: Partial<Record<ExifOrientation, string>> = {
  2: 'Mirrored',
  3: 'Rotated 180°',
  4: 'Mirrored vertically',
  5: 'Mirrored, rotated 90°',
  6: 'Rotated 90°',
  7: 'Mirrored, rotated 270°',
  8: 'Rotated 270°',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 py-1.5">
      <dt className="text-ui-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-ui break-words text-fg tabular-nums">{children}</dd>
    </div>
  );
}

/** Metadata for the active image (SKILLS.md §E-4). Dimensions are the EXIF-oriented size (ADR-007). */
export function ImageDetails() {
  const image = useLibraryStore((s) => (s.activeId ? s.images[s.activeId] : undefined));
  const selectedCount = useLibraryStore((s) => s.selection.size);

  if (!image) return null;
  const orientationNote = ORIENTATION_NOTES[image.orientation];

  return (
    <section aria-label="Image details" className="px-3 py-3">
      <h3 className="mb-1 text-ui-xs font-medium tracking-wider text-fg-muted uppercase">Details</h3>
      <dl className="divide-y divide-line-subtle">
        <Row label="File name">{image.originalFilename}</Row>
        {image.relativePath && image.relativePath !== image.originalFilename ? (
          <Row label="Folder">{image.relativePath.split('/').slice(0, -1).join(' / ')}</Row>
        ) : null}
        <Row label="Dimensions">
          {formatCount(image.width)} × {formatCount(image.height)} px
        </Row>
        <Row label="Format">{MIME_LABELS[image.mimeType]}</Row>
        <Row label="File size">{formatBytes(image.byteSize)}</Row>
        {orientationNote ? <Row label="Orientation">{orientationNote} (applied)</Row> : null}
        {image.hasAlpha ? <Row label="Transparency">Yes</Row> : null}
        {image.duplicateOfId ? <Row label="Duplicate">Identical to an earlier image</Row> : null}
      </dl>
      {selectedCount > 1 ? (
        <p className="mt-3 text-ui text-fg-muted">{pluralize(selectedCount, 'image')} selected.</p>
      ) : null}
    </section>
  );
}
