/**
 * Batch and image limits (SKILLS.md §D.12).
 *
 * `DEFAULT_LIMITS` is shared by client and server. The server may override values via
 * environment variables using `resolveLimits(process.env)`; the client must learn effective
 * limits from the server (it never reads server env).
 */

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export const DEFAULT_LIMITS = {
  maxBatchImages: 3000,
  maxFileBytes: 50 * MiB,
  maxBatchBytes: 15 * GiB,
  maxImagePixels: 100_000_000,
  maxImageSide: 20_000,
  maxOutputSide: 16_383,
  minCropSide: 16,
  uploadConcurrency: 4,
  workerConcurrency: 4,
  maxAttempts: 3,
  sessionTtlHours: 24,
  artifactTtlHours: 24,
} as const;

export type Limits = { -readonly [K in keyof typeof DEFAULT_LIMITS]: number };

/** Environment variable for each overridable limit. Limits not listed here are fixed. */
export const LIMIT_ENV_VARS = {
  maxBatchImages: 'FS_MAX_BATCH_IMAGES',
  maxFileBytes: 'FS_MAX_FILE_BYTES',
  maxBatchBytes: 'FS_MAX_BATCH_BYTES',
  maxImagePixels: 'FS_MAX_IMAGE_PIXELS',
  maxImageSide: 'FS_MAX_IMAGE_SIDE',
  maxOutputSide: 'FS_MAX_OUTPUT_SIDE',
  workerConcurrency: 'FS_WORKER_CONCURRENCY',
  maxAttempts: 'FS_MAX_ATTEMPTS',
  sessionTtlHours: 'FS_SESSION_TTL_HOURS',
  artifactTtlHours: 'FS_ARTIFACT_TTL_HOURS',
} as const satisfies Partial<Record<keyof Limits, string>>;

/** Hard ceilings that configuration may never exceed (format and safety constraints). */
const HARD_MAX: Partial<Record<keyof Limits, number>> = {
  maxOutputSide: 16_383, // WebP maximum dimension
  maxImageSide: 65_535, // JPEG maximum dimension
};

export class LimitsConfigError extends Error {
  override readonly name = 'LimitsConfigError';
}

/**
 * Resolve effective limits from an environment record.
 * Fails fast on malformed values: a typo in an env var must not silently weaken a safety limit.
 */
export function resolveLimits(env: Readonly<Record<string, string | undefined>>): Limits {
  const limits: Limits = { ...DEFAULT_LIMITS };

  for (const [key, envVar] of Object.entries(LIMIT_ENV_VARS) as [keyof typeof LIMIT_ENV_VARS, string][]) {
    const raw = env[envVar];
    if (raw === undefined || raw.trim() === '') continue;

    if (!/^\d+$/.test(raw.trim())) {
      throw new LimitsConfigError(`${envVar} must be a positive integer, got "${raw}"`);
    }
    const value = Number(raw.trim());
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new LimitsConfigError(`${envVar} must be a positive safe integer, got "${raw}"`);
    }
    const ceiling = HARD_MAX[key];
    if (ceiling !== undefined && value > ceiling) {
      throw new LimitsConfigError(`${envVar} must be ≤ ${ceiling}, got ${value}`);
    }
    limits[key] = value;
  }

  return limits;
}
