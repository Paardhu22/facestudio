/**
 * Filename and path sanitizing (SKILLS.md §D.10). Names are DISPLAY data only: storage keys are
 * server-generated, so user input never becomes a filesystem path. Sanitizing still matters because
 * names are echoed into the UI, export archives, and ZIP entry names.
 */

const MAX_NAME_LENGTH = 200;
const MAX_PATH_LENGTH = 512;
const MAX_PATH_DEPTH = 32;
// Control characters (C0, DEL, C1), path separators, and bidi/zero-width overrides that can disguise names.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f/\\​-‏‪-‮⁦-⁩﻿]/g;

const SUPPORTED_EXTENSION = /\.(jpe?g|png|webp)$/i;

export function hasSupportedExtension(name: string): boolean {
  return SUPPORTED_EXTENSION.test(name);
}

function sanitizeSegment(raw: string): string {
  return raw.normalize('NFC').replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
}

function truncatePreservingExtension(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : '';
  return name.slice(0, max - ext.length) + ext;
}

/** Sanitize a single file name. Never returns an empty string, "." or "..". */
export function sanitizeDisplayName(raw: string): string {
  const cleaned = sanitizeSegment(raw).replace(/^\.+$/, '');
  return truncatePreservingExtension(cleaned, MAX_NAME_LENGTH) || 'image';
}

/**
 * Sanitize a relative path from a folder upload (including the file name). Drops empty, `.` and `..`
 * segments, so it can never escape a root. Returns `null` when nothing usable remains.
 */
export function sanitizeRelativePath(raw: string): string | null {
  const segments = raw
    .split(/[\\/]/)
    .map(sanitizeSegment)
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..');
  if (segments.length === 0) return null;
  const limited = segments
    .slice(-MAX_PATH_DEPTH)
    .map((segment) => truncatePreservingExtension(segment, MAX_NAME_LENGTH));
  const joined = limited.join('/');
  return joined.length > MAX_PATH_LENGTH ? joined.slice(-MAX_PATH_LENGTH) : joined;
}
