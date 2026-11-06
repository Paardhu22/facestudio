'use client';

import { useDeferredValue, useMemo } from 'react';

import { useLibraryStore } from '@/stores/library-store';
import type { ImageId } from '@/types/domain';

/** Ids that pass the current search and filters, in display order. Typing stays responsive via a deferred query. */
export function useVisibleImageIds(): ImageId[] {
  const order = useLibraryStore((s) => s.order);
  const images = useLibraryStore((s) => s.images);
  const query = useLibraryStore((s) => s.query);
  const duplicatesOnly = useLibraryStore((s) => s.duplicatesOnly);
  const deferredQuery = useDeferredValue(query);

  return useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (needle === '' && !duplicatesOnly) return [...order];
    return order.filter((id) => {
      const image = images[id];
      if (!image) return false;
      if (duplicatesOnly && image.duplicateOfId === null) return false;
      return needle === '' || (image.relativePath ?? image.originalFilename).toLowerCase().includes(needle);
    });
  }, [order, images, deferredQuery, duplicatesOnly]);
}
