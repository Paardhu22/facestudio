/**
 * FaceStudio domain models (SKILLS.md §C, ADR-007).
 *
 * All types are plain, serializable data (JSON-safe): no class instances, Dates, Maps, or Blobs.
 * Geometry is in ORIENTED ORIGINAL PIXEL SPACE — the original image after EXIF orientation.
 */

// ── Identifiers ────────────────────────────────────────────────────────────────
export type SessionId = `ses_${string}`;
export type ImageId = `img_${string}`;
export type CropId = `crp_${string}`;
export type JobId = `job_${string}`;
export type JobItemId = `itm_${string}`;
export type ArtifactId = `art_${string}`;
export type FaceId = `f${number}`;

/** ISO-8601 UTC timestamp string. */
export type IsoTimestamp = string;

// ── Geometry ───────────────────────────────────────────────────────────────────
export type Point = { x: number; y: number };

/** Axis-aligned rectangle. For committed crops all fields are integers (ADR-007). */
export type Rect = { x: number; y: number; width: number; height: number };

export type Size = { width: number; height: number };

// ── Source images ──────────────────────────────────────────────────────────────
export const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** EXIF orientation tag values (1 = normal). */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type RenditionName = 'thumb' | 'preview';

export type SourceImage = {
  id: ImageId;
  /** Sanitized display name; never used as a filesystem path. */
  originalFilename: string;
  /** Sanitized relative path from folder uploads, INCLUDING the file name (display and export structure only). */
  relativePath: string | null;
  mimeType: SupportedMimeType;
  byteSize: number;
  /** Oriented dimensions: the canonical coordinate space. */
  width: number;
  height: number;
  orientation: ExifOrientation;
  hasAlpha: boolean;
  /** SHA-256 hex of the original bytes. */
  contentHash: string;
  /** Earlier image in this session with identical bytes. Flagged, never rejected (SKILLS.md §E-3). */
  duplicateOfId: ImageId | null;
  renditions: Record<RenditionName, Size>;
  createdAt: IsoTimestamp;
};

// ── Face detection ─────────────────────────────────────────────────────────────
export type FaceKeypointName = 'rightEye' | 'leftEye' | 'noseTip' | 'mouth' | 'rightEarTragion' | 'leftEarTragion';

export type DetectedFace = {
  id: FaceId;
  box: Rect;
  /** Detector confidence 0..1. */
  score: number;
  keypoints: Partial<Record<FaceKeypointName, Point>>;
};

export type DetectionStatus = 'pending' | 'running' | 'complete' | 'no_face' | 'failed';

/** A finished detection as stored and cached. `modelId` is part of the cache key: results from another model are ignored. */
export type DetectionResult = {
  modelId: string;
  status: Extract<DetectionStatus, 'complete' | 'no_face' | 'failed'>;
  faces: DetectedFace[];
};

export type FaceDetection = {
  imageId: ImageId;
  /** Cache key parts: results are reused only when hash + model match. */
  contentHash: string;
  modelId: string;
  status: DetectionStatus;
  faces: DetectedFace[];
  detectedAt: IsoTimestamp | null;
  errorMessage: string | null;
};

// ── Cropping ───────────────────────────────────────────────────────────────────
export type CropMode = 'portrait' | 'face' | 'custom';
export type CropShape = 'rectangle' | 'square' | 'circle' | 'hexagon';

export type AspectRatioPreset = '1:1' | '4:5' | '3:4' | '2:3' | '9:16' | '16:9' | 'original' | 'free' | 'custom';

/** `value` is width / height; `null` means unconstrained (free). */
export type AspectRatio = { preset: AspectRatioPreset; value: number | null };

/**
 * Framing parameters. All three are kept on every crop so switching mode never loses a setting:
 * portrait uses `faceFill` and `headroom`; face-only uses `padding`.
 */
export type FramingParams = {
  /** Face-box height as a fraction of crop height (portrait; default 0.42). */
  faceFill: number;
  /** Space above the face box as a fraction of crop height (portrait; default 0.18). */
  headroom: number;
  /** Padding per side as a fraction of face size (face-only; default 0.25). */
  padding: number;
};

export type CropRegion = {
  /** Missing on legacy crops means rectangle. */
  shape?: CropShape;
  id: CropId;
  mode: CropMode;
  /** Integer pixels in oriented original space. */
  rect: Rect;
  aspect: AspectRatio;
  /** Face that produced this crop (portrait/face modes). */
  faceId: FaceId | null;
  framing: FramingParams;
  /** True once the user has moved or resized an automatic crop. */
  manual: boolean;
  /** True when image bounds forced the framing to deviate (e.g. not enough headroom). */
  constrained: boolean;
  label: string | null;
};

// ── Adjustments ────────────────────────────────────────────────────────────────
/** Ranges and math: SKILLS.md §C.6 and `src/lib/image-processing/adjustment-spec.ts`. */
export type ImageAdjustments = {
  /** Stops (EV), −3…+3. */
  exposure: number;
  /** −100 (cool) … +100 (warm). */
  temperature: number;
  /** −100 (green) … +100 (magenta). */
  tint: number;
  /** −100 (grayscale) … +100. */
  saturation: number;
  /** −100 … +100 midtone curve; black and white points fixed. */
  brightness: number;
};

// ── Output ─────────────────────────────────────────────────────────────────────
export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'source';

/** How a crop maps onto an exact target size when the aspect ratios differ (SKILLS.md §E-9). */
export type FitStrategy = 'inside' | 'cover' | 'pad' | 'stretch';

export type ResizeSpec =
  | { mode: 'none' }
  | { mode: 'exact'; width: number; height: number; fit: FitStrategy }
  | { mode: 'longEdge'; size: number }
  | { mode: 'width'; width: number }
  | { mode: 'height'; height: number };

export type OutputSettings = {
  format: OutputFormat;
  /** 1…100; applies to JPEG and WebP. */
  quality: number;
  resize: ResizeSpec;
  allowUpscale: boolean;
  /** `#RRGGBB`, used for `pad` fit and JPEG alpha flattening. */
  padColor: string;
  /** Tokens: {name} {n} {w} {h} {mode}. */
  filenameTemplate: string;
};

/** Everything the user has changed about one image. Absent (not stored) when equal to the defaults. */
export type ImageEdit = {
  adjustments: ImageAdjustments;
  /** `null` = no crop (the whole image is exported). One crop per image for now. */
  crop: CropRegion | null;
  /** `null` = default output settings. */
  output: OutputSettings | null;
};

// ── Edit state ─────────────────────────────────────────────────────────────────
export type ProcessingStatus = 'idle' | 'queued' | 'processing' | 'done' | 'failed' | 'cancelled';

export type ImageEditState = {
  imageId: ImageId;
  /** Optimistic-concurrency version, incremented on every persisted change. */
  version: number;
  cropMode: CropMode;
  crops: CropRegion[];
  activeCropId: CropId | null;
  adjustments: ImageAdjustments;
  output: OutputSettings;
  updatedAt: IsoTimestamp;
};

// ── Batch operations and history ───────────────────────────────────────────────
export type EditScope = 'current' | 'selected' | 'all';

export type BatchOperationKind =
  'setCropMode' | 'setCrop' | 'applyCustomCrop' | 'setAdjustments' | 'setOutput' | 'reset';

/** One logical, undoable operation. Patches hold small edit-state slices only — never pixels. */
export type BatchOperation = {
  id: string;
  kind: BatchOperationKind;
  scope: EditScope;
  label: string;
  imageIds: ImageId[];
  createdAt: IsoTimestamp;
};

// ── Jobs and artifacts ─────────────────────────────────────────────────────────
export type JobStatus =
  'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'completed_with_errors' | 'failed';

export type JobItemStatus = 'queued' | 'processing' | 'done' | 'failed' | 'cancelled';

export type ProcessingJob = {
  id: JobId;
  kind: 'export';
  status: JobStatus;
  totals: { items: number; done: number; failed: number; cancelled: number };
  createdAt: IsoTimestamp;
  startedAt: IsoTimestamp | null;
  finishedAt: IsoTimestamp | null;
  errorMessage: string | null;
};

export type ExportArtifact = {
  id: ArtifactId;
  jobId: JobId;
  kind: 'zip';
  byteSize: number;
  fileCount: number;
  sha256: string;
  createdAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
};
