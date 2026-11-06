'use client';

import { useState } from 'react';

/**
 * Overlay colors read from the design tokens in `globals.css` (SKILLS.md §B.2): the canvas library needs concrete color
 * strings, but components must not hard-code colors, so they come from the same CSS variables as everything else.
 */
export type OverlayTokens = {
  crop: string;
  face: string;
  faceSelected: string;
  accent: string;
  scrim: string;
  app: string;
  canvas: string;
};

function read(): OverlayTokens {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    crop: get('--fs-crop', '#ffffff'),
    face: get('--fs-face', '#f0c35a'),
    faceSelected: get('--fs-face-selected', '#4b91f1'),
    accent: get('--fs-accent', '#4b91f1'),
    scrim: get('--fs-scrim', 'rgb(0 0 0 / 0.55)'),
    app: get('--fs-app', '#000000'),
    canvas: get('--fs-canvas', '#000000'),
  };
}

/** Read once, on the client (the stage is client-only). The theme is dark-only, so the tokens never change at run time. */
export function useOverlayTokens(): OverlayTokens {
  const [tokens] = useState(read);
  return tokens;
}
