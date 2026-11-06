'use client';

import { useEffect } from 'react';

import { loadLibrary } from './load-library';

/** Load the library once on mount. The abort on cleanup makes React StrictMode's double-mount harmless. */
export function useLibraryBootstrap(): void {
  useEffect(() => {
    const controller = new AbortController();
    void loadLibrary(controller.signal);
    return () => controller.abort();
  }, []);
}
