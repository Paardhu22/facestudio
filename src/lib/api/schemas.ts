import { z } from 'zod';

import { DEFAULT_LIMITS, type Limits } from '@/lib/config/limits';
import { ASPECT_PRESETS } from '@/lib/cropping/aspect';
import { FRAMING_LIMITS } from '@/lib/cropping/framing';
import { ADJUSTMENT_SPEC } from '@/lib/image-processing/adjustment-spec';
import {
  type CropId,
  type CropRegion,
  type DetectionResult,
  type ExifOrientation,
  type FaceId,
  type ImageAdjustments,
  type ImageEdit,
  type ImageId,
  type OutputSettings,
  SUPPORTED_MIME_TYPES,
  type SourceImage,
} from '@/types/domain';

/** Request and response contracts shared by route handlers and the browser client (SKILLS.md §D.6). */

export const IMAGE_ID_PATTERN = /^img_[A-Za-z0-9_-]{22}$/;

export const imageIdSchema = z.custom<ImageId>((value) => typeof value === 'string' && IMAGE_ID_PATTERN.test(value), {
  message: 'Invalid image id',
});

const orientationSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]) satisfies z.ZodType<ExifOrientation>;

const sizeSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive() });

export const sourceImageSchema = z.object({
  id: imageIdSchema,
  originalFilename: z.string(),
  relativePath: z.string().nullable(),
  mimeType: z.enum(SUPPORTED_MIME_TYPES),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: orientationSchema,
  hasAlpha: z.boolean(),
  contentHash: z.string(),
  duplicateOfId: imageIdSchema.nullable(),
  renditions: z.object({ thumb: sizeSchema, preview: sizeSchema }),
  createdAt: z.string(),
}) satisfies z.ZodType<SourceImage>;

const limitNumber = z.number().int().positive();

export const limitsSchema = z.object({
  maxBatchImages: limitNumber,
  maxFileBytes: limitNumber,
  maxBatchBytes: limitNumber,
  maxImagePixels: limitNumber,
  maxImageSide: limitNumber,
  maxOutputSide: limitNumber,
  minCropSide: limitNumber,
  uploadConcurrency: limitNumber,
  workerConcurrency: limitNumber,
  maxAttempts: limitNumber,
  sessionTtlHours: limitNumber,
  artifactTtlHours: limitNumber,
}) satisfies z.ZodType<Limits>;

export const LIST_PAGE_SIZE = 500;

export const listQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE).default(LIST_PAGE_SIZE),
});

export const listResponseSchema = z.object({
  images: z.array(sourceImageSchema),
  nextCursor: z.string().nullable(),
  limits: limitsSchema,
});
export type ListResponse = z.infer<typeof listResponseSchema>;

export const deleteImagesRequestSchema = z.object({
  ids: z.array(imageIdSchema).min(1).max(DEFAULT_LIMITS.maxBatchImages),
});

export const deleteImagesResponseSchema = z.object({ deleted: z.array(imageIdSchema) });

export const apiErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/** Header names for the raw-body image upload (SKILLS.md §D.6). Values are percent-encoded UTF-8. */
export const UPLOAD_HEADERS = {
  filename: 'x-fs-filename',
  relativePath: 'x-fs-relative-path',
} as const;

const bounded = (key: keyof ImageAdjustments) => z.number().min(ADJUSTMENT_SPEC[key].min).max(ADJUSTMENT_SPEC[key].max);

/** Ranges come from the shared adjustment spec, so client, server, and the pixel kernel agree (ADR-004). */
export const adjustmentsSchema = z.object({
  exposure: bounded('exposure'),
  temperature: bounded('temperature'),
  tint: bounded('tint'),
  saturation: bounded('saturation'),
  brightness: bounded('brightness'),
}) satisfies z.ZodType<ImageAdjustments>;

const intRect = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

const range = (key: keyof typeof FRAMING_LIMITS) =>
  z.number().min(FRAMING_LIMITS[key].min).max(FRAMING_LIMITS[key].max);

const faceIdSchema = z.custom<FaceId>((value) => typeof value === 'string' && /^f\d{1,3}$/.test(value), {
  message: 'Invalid face id',
});

export const cropSchema = z.object({
  id: z.custom<CropId>((value) => typeof value === 'string' && /^crp_[A-Za-z0-9_-]{22}$/.test(value), {
    message: 'Invalid crop id',
  }),
  mode: z.enum(['portrait', 'face', 'custom']),
  shape: z.enum(['rectangle', 'square', 'circle', 'hexagon']).optional(),
  rect: intRect,
  aspect: z.object({ preset: z.enum(ASPECT_PRESETS), value: z.number().min(0.1).max(10).nullable() }),
  faceId: faceIdSchema.nullable(),
  framing: z.object({ faceFill: range('faceFill'), headroom: range('headroom'), padding: range('padding') }),
  manual: z.boolean(),
  constrained: z.boolean(),
  label: z.string().max(80).nullable(),
}) satisfies z.ZodType<CropRegion>;

const side = z.number().int().min(1).max(16383);

export const outputSchema = z.object({
  format: z.enum(['source', 'jpeg', 'png', 'webp']),
  quality: z.number().int().min(1).max(100),
  resize: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({
      mode: z.literal('exact'),
      width: side,
      height: side,
      fit: z.enum(['inside', 'cover', 'pad', 'stretch']),
    }),
    z.object({ mode: z.literal('longEdge'), size: side }),
    z.object({ mode: z.literal('width'), width: side }),
    z.object({ mode: z.literal('height'), height: side }),
  ]),
  allowUpscale: z.boolean(),
  padColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  filenameTemplate: z.string().min(1).max(200),
}) satisfies z.ZodType<OutputSettings>;

/** One image's whole edit. `crop` and `output` default to `null` so adjustment-only clients keep working. */
const editItemSchema = z.object({
  id: imageIdSchema,
  adjustments: adjustmentsSchema,
  crop: cropSchema.nullable().default(null),
  output: outputSchema.nullable().default(null),
});

export const patchEditsRequestSchema = z.object({
  items: z.array(editItemSchema).min(1).max(DEFAULT_LIMITS.maxBatchImages),
});

export const patchEditsResponseSchema = z.object({ updated: z.number().int().nonnegative() });

const imageEditSchema = z.object({
  adjustments: adjustmentsSchema,
  crop: cropSchema.nullable(),
  output: outputSchema.nullable(),
}) satisfies z.ZodType<ImageEdit>;

/** Only images with a non-default edit appear. */
export const listEditsResponseSchema = z.object({ edits: z.record(z.string(), imageEditSchema) });

// ── Face detections ───────────────────────────────────────────────────────────
const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const faceSchema = z.object({
  id: faceIdSchema,
  box: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  score: z.number().min(0).max(1),
  keypoints: z.object({
    rightEye: point.optional(),
    leftEye: point.optional(),
    noseTip: point.optional(),
    mouth: point.optional(),
    rightEarTragion: point.optional(),
    leftEarTragion: point.optional(),
  }),
});

export const MAX_FACES_PER_IMAGE = 64;

export const detectionResultSchema = z.object({
  modelId: z.string().min(1).max(100),
  status: z.enum(['complete', 'no_face', 'failed']),
  faces: z.array(faceSchema).max(MAX_FACES_PER_IMAGE),
}) satisfies z.ZodType<DetectionResult>;

export const putDetectionsRequestSchema = z.object({
  items: z
    .array(z.object({ id: imageIdSchema, result: detectionResultSchema }))
    .min(1)
    .max(1000),
});
export const putDetectionsResponseSchema = z.object({ stored: z.number().int().nonnegative() });
export const listDetectionsResponseSchema = z.object({ detections: z.record(z.string(), detectionResultSchema) });
