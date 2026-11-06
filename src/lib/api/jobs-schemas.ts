import { z } from 'zod';

import { DEFAULT_LIMITS } from '@/lib/config/limits';

import { patchEditsRequestSchema } from './schemas';

export const JOB_ID_PATTERN = /^job_[A-Za-z0-9_-]{22}$/;
export const ARTIFACT_ID_PATTERN = /^art_[A-Za-z0-9_-]{22}$/;
export const createJobSchema = z.object({
  items: patchEditsRequestSchema.shape.items,
  preserveFolders: z.boolean().default(false),
});
export const jobSchema = z.object({
  id: z.string().regex(JOB_ID_PATTERN),
  kind: z.literal('export'),
  status: z.enum(['queued', 'running', 'cancelling', 'cancelled', 'completed', 'completed_with_errors', 'failed']),
  totals: z.object({
    items: z.number().int(),
    done: z.number().int(),
    failed: z.number().int(),
    cancelled: z.number().int(),
  }),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  phase: z.enum(['queued', 'rendering', 'packaging', 'finished']),
  artifact: z
    .object({
      id: z.string().regex(ARTIFACT_ID_PATTERN),
      byteSize: z.number(),
      fileCount: z.number().int(),
      expiresAt: z.string(),
    })
    .nullable(),
  errors: z
    .array(z.object({ imageId: z.string(), filename: z.string(), message: z.string() }))
    .max(DEFAULT_LIMITS.maxBatchImages),
});
export type ExportJob = z.infer<typeof jobSchema>;
export const jobResponseSchema = z.object({ job: jobSchema });
export const latestJobResponseSchema = z.object({ job: jobSchema.nullable() });
export const isActiveJob = (job: Pick<ExportJob, 'status'>): boolean =>
  ['queued', 'running', 'cancelling'].includes(job.status);
