/**
 * Services throw; the two entry points translate. A REST handler maps `code` to a status, a Server
 * Action maps it to a form error. Neither layer needs to know which service it called, which is what
 * keeps `lib/services/**` free of HTTP.
 */

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable';

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Field-keyed messages for `invalid`; free-form context otherwise. Safe to show a user. */
  readonly details?: Record<string, string>;

  constructor(code: ErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Sign in to continue') =>
  new AppError('unauthorized', message);

export const forbidden = (message = 'You do not have access to this') =>
  new AppError('forbidden', message);

export const notFound = (what = 'That') => new AppError('not_found', `${what} could not be found`);

export const invalid = (message: string, details?: Record<string, string>) =>
  new AppError('invalid', message, details);

export const conflict = (message: string, details?: Record<string, string>) =>
  new AppError('conflict', message, details);

export const rateLimited = (message = 'Too many requests', retryAfterSeconds?: number) =>
  new AppError(
    'rate_limited',
    message,
    retryAfterSeconds ? { retryAfterSeconds: String(retryAfterSeconds) } : undefined,
  );

export const unavailable = (message: string) => new AppError('unavailable', message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 422,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
};

export function httpStatus(error: unknown): number {
  return isAppError(error) ? STATUS[error.code] : 500;
}

/**
 * An unrecognised error is someone else's stack trace and may carry a connection string, so the
 * message is replaced rather than forwarded. The original still reaches the logs at the call site.
 */
export function toPublicError(error: unknown): { code: ErrorCode | 'internal'; message: string; details?: Record<string, string> } {
  if (isAppError(error)) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return { code: 'internal', message: 'Something went wrong' };
}
