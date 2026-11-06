import 'server-only';

/** Stable error codes (SKILLS.md §C.11). Messages are user-safe; internals never reach the client. */
export type ErrorCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'dimensions_exceeded'
  | 'pixel_limit_exceeded'
  | 'batch_limit_reached'
  | 'batch_bytes_exceeded'
  | 'animated_not_supported'
  | 'decode_failed'
  | 'not_found'
  | 'forbidden'
  | 'invalid_request'
  | 'conflict'
  | 'internal_error';

const HTTP_STATUS: Record<ErrorCode, number> = {
  unsupported_type: 415,
  file_too_large: 413,
  dimensions_exceeded: 422,
  pixel_limit_exceeded: 422,
  batch_limit_reached: 409,
  batch_bytes_exceeded: 413,
  animated_not_supported: 422,
  decode_failed: 422,
  not_found: 404,
  forbidden: 403,
  invalid_request: 400,
  conflict: 409,
  internal_error: 500,
};

export class AppError extends Error {
  override readonly name = 'AppError';
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
