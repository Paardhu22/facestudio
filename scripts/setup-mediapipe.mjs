#!/usr/bin/env node
/**
 * Installs the face-detection runtime into `public/mediapipe/` (SKILLS.md §C.7). The app serves everything itself, so the
 * browser never contacts a third party at run time.
 *   1. copies MediaPipe's browser bundle and WASM from node_modules (always works offline)
 *   2. downloads the BlazeFace short-range model once and verifies its SHA-256
 * A missing model is NOT fatal: the app starts, face detection reports itself unavailable, and custom crops keep working.
 * Run automatically before `dev` and `build`; safe to run any time (idempotent).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const target = path.join(root, 'public', 'mediapipe');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';
const MODEL_FILE = path.join(target, 'blaze_face_short_range.tflite');
const MODEL_SHA256 = 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f';

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function copyIfChanged(from, to) {
  if (existsSync(to) && statSync(to).size === statSync(from).size) return false;
  copyFileSync(from, to);
  return true;
}

if (!existsSync(source)) {
  console.error('[mediapipe] @mediapipe/tasks-vision is not installed. Run `npm install` first.');
  process.exit(1);
}

mkdirSync(path.join(target, 'wasm'), { recursive: true });
let copied = 0;
if (copyIfChanged(path.join(source, 'vision_bundle.js'), path.join(target, 'vision_bundle.js'))) copied += 1;
for (const name of readdirSync(path.join(source, 'wasm'))) {
  if (copyIfChanged(path.join(source, 'wasm', name), path.join(target, 'wasm', name))) copied += 1;
}
console.log(`[mediapipe] runtime ready (${copied} file(s) updated)`);

if (existsSync(MODEL_FILE) && sha256(MODEL_FILE) === MODEL_SHA256) {
  console.log('[mediapipe] model ready');
} else {
  try {
    const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== MODEL_SHA256) throw new Error(`checksum mismatch (got ${digest})`);
    writeFileSync(MODEL_FILE, bytes);
    console.log(`[mediapipe] model downloaded (${bytes.length} bytes, checksum verified)`);
  } catch (error) {
    console.warn(
      `[mediapipe] WARNING: could not install the face model (${error instanceof Error ? error.message : error}).\n` +
        '            Face detection will be unavailable until you run `npm run setup:mediapipe` with network access.',
    );
  }
}
