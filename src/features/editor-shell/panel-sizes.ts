/**
 * Editor panel geometry and per-viewer persistence (SKILLS.md §B.11).
 * Side panels are persisted in **pixels** so they keep their width when the window resizes.
 */

export const PANEL_SIZES = {
  library: { default: 280, min: 220, max: 420 },
  canvas: { min: 400 },
  controls: { default: 300, min: 260, max: 400 },
} as const;

export const PANEL_SIZES_STORAGE_KEY = 'facestudio:editor-panels:v1';

export type SidePanelSizes = { library: number; controls: number };

function clampSize(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.min(max, Math.max(min, value)));
}

/**
 * Parse stored sizes defensively: storage is untrusted input (SKILLS.md §D.1).
 * Returns `null` for anything malformed; out-of-range values are clamped to panel limits.
 */
export function parseSidePanelSizes(raw: string | null): SidePanelSizes | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const library = clampSize(record.library, PANEL_SIZES.library.min, PANEL_SIZES.library.max);
  const controls = clampSize(record.controls, PANEL_SIZES.controls.min, PANEL_SIZES.controls.max);
  if (library === null || controls === null) return null;
  return { library, controls };
}

export function serializeSidePanelSizes(sizes: SidePanelSizes): string {
  return JSON.stringify({ library: Math.round(sizes.library), controls: Math.round(sizes.controls) });
}
