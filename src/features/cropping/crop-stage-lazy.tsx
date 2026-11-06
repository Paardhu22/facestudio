'use client';

import dynamic from 'next/dynamic';

/**
 * The Konva stage is client-only: Konva needs a real canvas and its Node build would otherwise be pulled into the server
 * render. Loading it lazily also keeps the canvas library out of the landing page and the initial editor bundle.
 */
export const CropStage = dynamic(() => import('./crop-stage'), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1 bg-surface-canvas" aria-hidden="true" />,
});
