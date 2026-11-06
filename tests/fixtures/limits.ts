import { DEFAULT_LIMITS, type Limits } from '@/lib/config/limits';

/** A mutable copy of the default limits, for tests that finish a library load. */
export const DEFAULT_CONFIG_FOR_TEST: Limits = { ...DEFAULT_LIMITS };
