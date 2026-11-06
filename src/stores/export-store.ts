import { create } from 'zustand';
import type { ExportJob } from '@/lib/api/jobs-schemas';

export const useExportStore = create<{ job: ExportJob | null; setJob: (job: ExportJob | null) => void }>((set) => ({
  job: null,
  setJob: (job) => set({ job }),
}));
