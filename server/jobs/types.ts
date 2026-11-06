import type { ImageEdit, SourceImage } from '@/types/domain';

export type RenderTask = {
  id: string;
  jobId: string;
  sessionId: string;
  leaseToken: string;
  image: SourceImage;
  edit: ImageEdit;
  outputKey: string;
};
export const LEASE_MS = 60_000;
