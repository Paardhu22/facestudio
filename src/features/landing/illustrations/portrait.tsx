import type { ReactNode } from 'react';

import type { Rect } from '@/types/domain';

/**
 * Abstract portrait artwork for the landing page (SKILLS.md §E-1).
 * Original, stylized shapes — not photographs of real people.
 *
 * Illustration palettes depict photo content, not UI chrome, so they are the single sanctioned
 * place for literal colors outside `globals.css` (SKILLS.md §B.2 exception).
 */

export const PORTRAIT_VIEWBOX = { width: 300, height: 375 } as const;

export type PortraitPalette = {
  bg: string;
  bgShade: string;
  skin: string;
  skinShade: string;
  hair: string;
  top: string;
};

export const PORTRAIT_PALETTES = {
  slate: { bg: '#3d4b5b', bgShade: '#334050', skin: '#c99878', skinShade: '#b4836a', hair: '#2a1d16', top: '#1f2933' },
  umber: { bg: '#5a4b40', bgShade: '#4d4037', skin: '#8e5b3c', skinShade: '#7b4d33', hair: '#16100c', top: '#2e3c31' },
  sage: { bg: '#43544f', bgShade: '#394842', skin: '#e2b896', skinShade: '#cfa483', hair: '#a1693a', top: '#3c2f45' },
  plum: { bg: '#4b3f53', bgShade: '#403647', skin: '#6c4329', skinShade: '#5d3922', hair: '#0f0b09', top: '#5a4632' },
  teal: { bg: '#314649', bgShade: '#2a3c3f', skin: '#d8a684', skinShade: '#c29171', hair: '#57381f', top: '#27353f' },
  stone: { bg: '#57514b', bgShade: '#4b4641', skin: '#b17c57', skinShade: '#9c6b4a', hair: '#2f2f2f', top: '#3b4a5c' },
} as const satisfies Record<string, PortraitPalette>;

export type PortraitPaletteName = keyof typeof PORTRAIT_PALETTES;

/** Subject placement: horizontal offset and uniform scale about the bottom-center of the frame. */
export type SubjectPose = { dx?: number; scale?: number };

const BASE_FACE_BOX: Rect = { x: 101, y: 112, width: 98, height: 104 };

/** Face box (what a detector would report) for a given pose, in viewBox units. */
export function faceBoxFor({ dx = 0, scale = 1 }: SubjectPose = {}): Rect {
  const cx = 150 + dx;
  const by = PORTRAIT_VIEWBOX.height;
  return {
    x: cx + scale * (BASE_FACE_BOX.x - 150),
    y: by + scale * (BASE_FACE_BOX.y - by),
    width: scale * BASE_FACE_BOX.width,
    height: scale * BASE_FACE_BOX.height,
  };
}

/**
 * Illustrative framing using the documented defaults (SKILLS.md §E-6):
 * portrait → faceFill 0.42, headroom 0.18; face → padding 0.25. Clamped to the frame.
 * The production algorithm lives in `src/lib/cropping` (Phase 3).
 */
export function illustrativeCrop(mode: 'portrait' | 'face', face: Rect, aspect: number): Rect {
  const { width: W, height: H } = PORTRAIT_VIEWBOX;
  let w: number;
  let h: number;
  let x: number;
  let y: number;
  if (mode === 'portrait') {
    h = face.height / 0.42;
    w = h * aspect;
    x = face.x + face.width / 2 - w / 2;
    y = face.y - 0.18 * h;
  } else {
    const pw = face.width * 1.5;
    const ph = face.height * 1.5;
    if (pw / ph > aspect) {
      w = pw;
      h = pw / aspect;
    } else {
      h = ph;
      w = ph * aspect;
    }
    x = face.x + face.width / 2 - w / 2;
    y = face.y + face.height / 2 - h / 2;
  }
  x = Math.min(Math.max(0, x), W - w);
  y = Math.min(Math.max(0, y), H - h);
  return { x, y, width: w, height: h };
}

/** One stylized head-and-shoulders subject, drawn in the 300×375 portrait coordinate space. */
export function SubjectShape({ palette, transform }: { palette: PortraitPalette; transform?: string }) {
  const p = palette;
  return (
    <g transform={transform}>
      {/* shoulders */}
      <path d="M34 375c4-70 52-110 116-114 64 4 112 44 116 114Z" fill={p.top} />
      {/* neck */}
      <path d="M128 204h44v52c-7 9-15 13-22 13s-15-4-22-13Z" fill={p.skinShade} />
      {/* ears */}
      <ellipse cx="99" cy="160" rx="9" ry="15" fill={p.skinShade} />
      <ellipse cx="201" cy="160" rx="9" ry="15" fill={p.skinShade} />
      {/* head */}
      <ellipse cx="150" cy="152" rx="52" ry="65" fill={p.skin} />
      {/* hair */}
      <path d="M96 160c-6-56 18-88 54-88s62 30 54 88c-6-26-20-44-40-48-16 10-40 12-68 0Z" fill={p.hair} />
    </g>
  );
}

/** Transform placing a subject at horizontal center `cx`, scaled about the bottom edge `baseY`. */
export function subjectTransform(cx: number, baseY: number, scale: number): string {
  return `translate(${cx} ${baseY}) scale(${scale}) translate(-150 -${PORTRAIT_VIEWBOX.height})`;
}

type PortraitArtProps = {
  palette?: PortraitPaletteName;
  pose?: SubjectPose;
  className?: string;
  /** Overlays drawn in the same viewBox coordinate space. */
  children?: ReactNode;
};

export function PortraitArt({ palette = 'slate', pose = {}, className, children }: PortraitArtProps) {
  const p = PORTRAIT_PALETTES[palette];
  const { dx = 0, scale = 1 } = pose;
  const { width: W, height: H } = PORTRAIT_VIEWBOX;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect width={W} height={H} fill={p.bg} />
      <rect y={H * 0.62} width={W} height={H * 0.38} fill={p.bgShade} />
      <SubjectShape palette={p} transform={subjectTransform(150 + dx, H, scale)} />
      {children}
    </svg>
  );
}

export const GROUP_VIEWBOX = { width: 600, height: 375 } as const;

export type GroupMember = { palette: PortraitPaletteName; cx: number; scale: number };

/** Face box of a group member, in group viewBox units. */
export function groupFaceBox({ cx, scale }: GroupMember): Rect {
  const by = GROUP_VIEWBOX.height;
  return {
    x: cx + scale * (BASE_FACE_BOX.x - 150),
    y: by + scale * (BASE_FACE_BOX.y - PORTRAIT_VIEWBOX.height),
    width: scale * BASE_FACE_BOX.width,
    height: scale * BASE_FACE_BOX.height,
  };
}

/** Wide scene with several subjects, for multi-face detection visuals. */
export function GroupArt({
  members,
  background = 'stone',
  className,
  children,
}: {
  members: readonly GroupMember[];
  background?: PortraitPaletteName;
  className?: string;
  children?: ReactNode;
}) {
  const bg = PORTRAIT_PALETTES[background];
  const { width: W, height: H } = GROUP_VIEWBOX;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect width={W} height={H} fill={bg.bg} />
      <rect y={H * 0.62} width={W} height={H * 0.38} fill={bg.bgShade} />
      {members.map((m, i) => (
        <SubjectShape key={i} palette={PORTRAIT_PALETTES[m.palette]} transform={subjectTransform(m.cx, H, m.scale)} />
      ))}
      {children}
    </svg>
  );
}

type FaceBoxProps = { box: Rect; label?: string; selected?: boolean; keypoints?: boolean };

/** Detected-face overlay (SKILLS.md §B.13): dashed amber, solid brand when selected. */
export function FaceBoxOverlay({ box, label, selected = false, keypoints = false }: FaceBoxProps) {
  const color = selected ? 'var(--fs-face-selected)' : 'var(--fs-face)';
  const cx = box.x + box.width / 2;
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={selected ? undefined : '5 4'}
        vectorEffect="non-scaling-stroke"
        rx="2"
      />
      {keypoints ? (
        <g fill={color}>
          <circle cx={cx - box.width * 0.2} cy={box.y + box.height * 0.38} r="2.5" />
          <circle cx={cx + box.width * 0.2} cy={box.y + box.height * 0.38} r="2.5" />
          <circle cx={cx} cy={box.y + box.height * 0.58} r="2.5" />
          <circle cx={cx} cy={box.y + box.height * 0.77} r="2.5" />
        </g>
      ) : null}
      {label ? (
        <g>
          <rect x={box.x} y={box.y - 17} width={label.length * 6.4 + 10} height="15" rx="2" fill={color} />
          <text x={box.x + 5} y={box.y - 6} fontSize="10" fontWeight="600" fill="#151619" fontFamily="var(--font-sans)">
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

type CropFrameProps = {
  rect: Rect;
  /** Size of the artwork the scrim covers; defaults to the portrait viewBox. */
  bounds?: { width: number; height: number };
  thirds?: boolean;
  handles?: boolean;
  scrim?: boolean;
  tone?: 'crop' | 'brand' | 'muted';
};

/** Crop overlay (SKILLS.md §B.13): scrim outside, white frame, thirds, 8 handles. */
export function CropFrameOverlay({
  rect,
  bounds = PORTRAIT_VIEWBOX,
  thirds = true,
  handles = true,
  scrim = true,
  tone = 'crop',
}: CropFrameProps) {
  const { width: W, height: H } = bounds;
  const { x, y, width: w, height: h } = rect;
  const stroke = tone === 'brand' ? 'var(--fs-accent)' : tone === 'muted' ? 'rgb(255 255 255 / 0.5)' : 'var(--fs-crop)';
  const hs = 7;
  const handlePoints: [number, number][] = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x + w, y + h / 2],
    [x + w, y + h],
    [x + w / 2, y + h],
    [x, y + h],
    [x, y + h / 2],
  ];
  return (
    <g>
      {scrim ? (
        <path d={`M0 0H${W}V${H}H0Z M${x} ${y}V${y + h}H${x + w}V${y}Z`} fill="var(--fs-scrim)" fillRule="evenodd" />
      ) : null}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke="rgb(0 0 0 / 0.5)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      {thirds ? (
        <g stroke="rgb(255 255 255 / 0.35)" strokeWidth="0.75" vectorEffect="non-scaling-stroke">
          <line x1={x + w / 3} y1={y} x2={x + w / 3} y2={y + h} />
          <line x1={x + (2 * w) / 3} y1={y} x2={x + (2 * w) / 3} y2={y + h} />
          <line x1={x} y1={y + h / 3} x2={x + w} y2={y + h / 3} />
          <line x1={x} y1={y + (2 * h) / 3} x2={x + w} y2={y + (2 * h) / 3} />
        </g>
      ) : null}
      {handles
        ? handlePoints.map(([px, py]) => (
            <rect
              key={`${px}-${py}`}
              x={px - hs / 2}
              y={py - hs / 2}
              width={hs}
              height={hs}
              fill="var(--fs-crop)"
              stroke="var(--fs-app)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))
        : null}
    </g>
  );
}
