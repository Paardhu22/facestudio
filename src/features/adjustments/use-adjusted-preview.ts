'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

import { previewUrl } from '@/lib/api/images-api';
import type { ImageAdjustments, ImageId } from '@/types/domain';

import { getPreviewClient } from './preview-client';

export type PreviewPhase = 'loading' | 'ready' | 'error';

export type AdjustedPreview = {
  /** Holds an off-screen canvas with the current rendering (set once the first pixels exist). Draw from it; do not mount it. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Increments every time the canvas has new pixels, so renderers know to redraw. */
  version: number;
  phase: PreviewPhase;
};

/**
 * The open image with its adjustments applied, rendered by the adjustment worker (ADR-015) onto an off-screen canvas.
 * The server's preview rendition is decoded once and handed to the worker; each adjustment change re-renders from the
 * pristine pixels with the latest value winning. While the worker loads, the plain preview is drawn so there is never a
 * blank frame. If the worker is unavailable the plain preview stays and `phase` is `error`.
 */
export function useAdjustedPreview(id: ImageId, adjustments: ImageAdjustments): AdjustedPreview {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [version, setVersion] = useState(0);
  // The outcome is keyed by image id, so switching images is "loading" again without setting state inside an effect.
  const [outcome, setOutcome] = useState<{ id: ImageId; phase: Exclude<PreviewPhase, 'loading'> } | null>(null);
  const phase: PreviewPhase = outcome?.id === id ? outcome.phase : 'loading';

  // Load the source into the worker whenever the open image changes.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(previewUrl(id), { signal: controller.signal });
        if (!response.ok) throw new Error('preview request failed');
        const bitmap = await createImageBitmap(await response.blob());
        if (cancelled) {
          bitmap.close();
          return;
        }
        // Show the plain preview immediately (the bitmap is about to be handed to the worker).
        const canvas = (canvasRef.current ??= document.createElement('canvas'));
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
        setVersion((v) => v + 1);

        const { width, height } = await getPreviewClient().load(bitmap);
        if (cancelled) return;
        canvas.width = width;
        canvas.height = height;
        setOutcome({ id, phase: 'ready' });
      } catch {
        if (!cancelled) setOutcome({ id, phase: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // Forget the outcome: the worker is about to hold a different image, so a stale "ready" for this one (A → B → A)
      // would render these adjustments over the wrong pixels.
      setOutcome(null);
    };
  }, [id]);

  // Re-render whenever the adjustments change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (phase !== 'ready' || !canvas) return;
    let cancelled = false;
    void getPreviewClient()
      .render(adjustments)
      .then((result) => {
        if (!result) return; // superseded by a newer request
        const context = canvas.getContext('2d');
        if (!cancelled && context) {
          context.drawImage(result.bitmap, 0, 0);
          setVersion((v) => v + 1);
        }
        result.bitmap.close();
      });
    return () => {
      cancelled = true;
    };
  }, [phase, adjustments]);

  return { canvasRef, version, phase };
}
