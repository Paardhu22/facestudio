/**
 * Face detection constants shared by the browser worker and the server (SKILLS.md §C.7, ADR-002, ADR-009).
 * Detection is cached by image content plus `FACE_MODEL_ID`: bumping the id invalidates every stored result.
 */
export const FACE_MODEL_ID = 'mediapipe-blaze_face_short_range-float16-v1';

/** Minimum detector confidence for a face to be reported. */
export const FACE_MIN_CONFIDENCE = 0.5;

/** Where the self-hosted runtime and model are served from (copied/downloaded by `scripts/setup-mediapipe.mjs`). */
export const MEDIAPIPE_WASM_PATH = '/mediapipe/wasm';
export const FACE_MODEL_PATH = '/mediapipe/blaze_face_short_range.tflite';
