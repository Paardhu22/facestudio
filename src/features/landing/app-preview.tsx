import Image from 'next/image';
import {
  Check,
  ChevronDown,
  Crop,
  FolderOpen,
  Images,
  Maximize,
  MousePointer2,
  Plus,
  Redo2,
  ScanFace,
  Search,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';

import { LogoMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

const SLIDERS = [
  { label: 'Exposure', value: '+0.35', position: 58 },
  { label: 'Temperature', value: '+12', position: 62 },
  { label: 'Tint', value: '−4', position: 46 },
  { label: 'Saturation', value: '+8', position: 58 },
  { label: 'Brightness', value: '+5', position: 55 },
];

/** A labelled, noninteractive illustration. These sample photos never enter the user's library. */
export function AppPreview({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Illustration of the FaceStudio editor: a portrait contact sheet, precise face framing, and image adjustments. Sample project, not an interactive editor."
      className={cn('studio-preview', className)}
    >
      <div className="mock-toolbar">
        <LogoMark className="size-5" />
        <span className="mock-divider" />
        <FolderOpen className="size-3.5 text-fg-muted" />
        <span>Studio portraits</span>
        <ChevronDown className="size-3 text-fg-muted" />
        <span className="mock-project-label">Sample project</span>
        <span className="mock-history">
          <Undo2 />
          <Redo2 />
        </span>
        <span className="mock-save">
          <span className="status-light" /> All changes saved
        </span>
      </div>
      <div className="mock-workspace">
        <div className="mock-library">
          <div className="mock-panel-title">
            <span>
              <Images /> Library
            </span>
            <span className="mock-count">06</span>
          </div>
          <div className="mock-import">
            <Plus /> Add images
          </div>
          <div className="mock-search">
            <Search /> Search images
          </div>
          <div className="mock-library-meta">
            <span>All images</span>
            <span>2 selected</span>
          </div>
          <div className="mock-contact-sheet">
            {Array.from({ length: 6 }, (_, i) => (
              <div className={cn('mock-thumbnail', i < 2 && 'is-selected')} key={i}>
                <div className="mock-thumb-image">
                  <Image src={`/images/studio/portrait-0${i + 1}.webp`} alt="" fill sizes="100px" />
                  {i < 2 && (
                    <span className="mock-checkbox">
                      <Check />
                    </span>
                  )}
                </div>
                <span>Portrait_0{i + 1}.jpg</span>
              </div>
            ))}
          </div>
          <div className="mock-library-bottom">
            <FolderOpen /> One shoot. All together.
          </div>
        </div>
        <div className="mock-canvas">
          <div className="mock-canvas-top">
            <span>Portrait_01.jpg</span>
            <span>
              <ScanFace /> 1 face detected
            </span>
          </div>
          <div className="mock-image-area">
            <div className="mock-tool-rail">
              <MousePointer2 />
              <Crop />
              <ScanFace />
            </div>
            <div className="mock-portrait">
              <Image src="/images/studio/portrait-01.webp" alt="" fill sizes="(max-width: 768px) 70vw, 430px" preload />
              <div className="mock-crop-frame">
                <span />
                <span />
                <span />
                <span />
                <div className="mock-face-box">
                  <span>Face 1</span>
                </div>
                <div className="mock-thirds" />
              </div>
              <span className="mock-ratio">4 : 5</span>
            </div>
          </div>
          <div className="mock-canvas-bottom">
            <span>Original pixels. Precise framing.</span>
            <span>
              <Maximize /> Fit <ChevronDown />
            </span>
          </div>
        </div>
        <div className="mock-controls">
          <div className="mock-panel-title">
            <span>
              <SlidersHorizontal /> Edit image
            </span>
            <span>01</span>
          </div>
          <div className="mock-control-section">
            <div className="mock-control-heading">
              <span>Crop & frame</span>
              <ChevronDown />
            </div>
            <div className="mock-tabs">
              <span>Portrait</span>
              <span>Face</span>
              <span>Custom</span>
            </div>
            <div className="mock-setting">
              <span>Aspect ratio</span>
              <span>
                4 : 5 <ChevronDown />
              </span>
            </div>
            <div className="mock-setting">
              <span>Headroom</span>
              <span>18 %</span>
            </div>
          </div>
          <div className="mock-control-section">
            <div className="mock-control-heading">
              <span>Adjustments</span>
              <ChevronDown />
            </div>
            {SLIDERS.map((s) => (
              <div className="mock-slider" key={s.label}>
                <div>
                  <span>{s.label}</span>
                  <span>{s.value}</span>
                </div>
                <div
                  className={cn('mock-track', s.label === 'Temperature' && 'temperature', s.label === 'Tint' && 'tint')}
                >
                  <span style={{ left: `${s.position}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mock-apply">
            <span>Apply to selected</span>
            <span>2 images</span>
          </div>
          <p className="mock-nondestructive">Your originals stay untouched.</p>
        </div>
      </div>
      <div className="mock-status">
        <span>
          <span className="status-light" /> Ready to create
        </span>
        <span>
          6 images <span className="mock-divider" /> 2 selected
        </span>
        <span>Non-destructive editing</span>
      </div>
    </div>
  );
}
