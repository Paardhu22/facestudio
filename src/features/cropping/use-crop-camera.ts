'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { interpolateView, type ViewTransform } from '@/lib/coordinates/view';

const SETTLE_MS = 320;

/** Interruptible camera motion. Pointer coordinates always use the currently displayed frame. */
export function useCropCamera(fallback: ViewTransform) {
  const [override, setOverride] = useState<ViewTransform | null>(null);
  const [settling, setSettling] = useState(false);
  const current = useRef(fallback);
  const animation = useRef<number | null>(null);
  const destination = useRef<ViewTransform | null>(null);
  const view = override ?? fallback;

  useLayoutEffect(() => {
    current.current = view;
  }, [view]);

  const stop = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    destination.current = null;
    setSettling(false);
  }, []);

  const setView = useCallback(
    (next: ViewTransform) => {
      stop();
      current.current = next;
      setOverride(next);
    },
    [stop],
  );

  const animateTo = useCallback(
    (target: ViewTransform) => {
      stop();
      const from = current.current;
      if (
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        (Math.abs(target.scale - from.scale) < 0.0001 && Math.hypot(target.x - from.x, target.y - from.y) < 0.5)
      ) {
        current.current = target;
        setOverride(target);
        return;
      }
      setSettling(true);
      destination.current = target;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / SETTLE_MS);
        const next = progress === 1 ? target : interpolateView(from, target, progress);
        current.current = next;
        setOverride(next);
        if (progress < 1) animation.current = requestAnimationFrame(tick);
        else {
          animation.current = null;
          destination.current = null;
          setSettling(false);
        }
      };
      animation.current = requestAnimationFrame(tick);
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    current.current = fallback;
    setOverride(null);
  }, [fallback, stop]);

  useEffect(
    () => () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
    },
    [],
  );

  // If the user enables reduced motion while settling, complete the camera move without further animation.
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      const target = destination.current;
      if (media.matches && target) setView(target);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [setView]);

  return { view, settling, setView, animateTo, stop, reset };
}
