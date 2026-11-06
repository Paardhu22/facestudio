'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Crop, MoveUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

const MODES = [
  {
    id: 'portrait',
    label: 'Portrait / Headshot',
    ratio: '4 : 5',
    note: 'Head, shoulders, and a little breathing room.',
  },
  { id: 'face', label: 'Face-only', ratio: '1 : 1', note: 'A closer frame, with the face at the center.' },
  { id: 'custom', label: 'Custom bounding box', ratio: 'Free', note: 'Your composition. Your exact dimensions.' },
] as const;

export function CropExplorer() {
  const [mode, setMode] = useState<(typeof MODES)[number]>(MODES[0]);
  return (
    <div className="crop-explorer">
      <div className="crop-explorer-top">
        <span>
          <Crop /> Find your frame
        </span>
        <span>
          Interactive preview <MoveUpRight />
        </span>
      </div>
      <div role="group" aria-label="Preview crop modes" className="crop-mode-buttons">
        {MODES.map((m) => (
          <button type="button" key={m.id} aria-pressed={mode.id === m.id} onClick={() => setMode(m)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="crop-explorer-stage">
        <div className="crop-explorer-photo">
          <Image
            src="/images/studio/portrait-01.webp"
            alt="Sample portrait with an illustrative crop. Choose a crop mode to compare framing."
            fill
            sizes="(max-width: 768px) 70vw, 340px"
          />
          <div data-testid="crop-preview-frame" className={cn('explorer-frame', `explorer-frame-${mode.id}`)}>
            <i />
            <i />
            <i />
            <i />
            <span>{mode.ratio}</span>
          </div>
        </div>
        <span className="crop-explorer-dimension">Illustrative framing</span>
      </div>
      <div className="crop-explorer-note" aria-live="polite">
        <span>{mode.note}</span>
        <span className="tabular-nums">{mode.ratio}</span>
      </div>
    </div>
  );
}
