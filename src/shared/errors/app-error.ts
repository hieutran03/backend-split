/**
 * Lỗi nghiệp vụ/ứng dụng — thuần TypeScript, không biết HTTP.
 *
 * `code` là mã chuẩn của envelope (§4.1 S1): bad_request, unauthorized, forbidden,
 * not_found, conflict, gone, unprocessable, too_many_requests, bad_gateway,
 * service_unavailable, internal_error. `reason` là lý do nghiệp vụ chi tiết
 * (vd. conversation_turn_conflict), đi vào `data.reason` của response.
 *
 * Tầng HTTP (platform/http/app-exception.filter.ts) map `code` -> status.
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'unprocessable'
  | 'too_many_requests'
  | 'bad_gateway'
  | 'service_unavailable'
  | 'internal_error';

export class AppError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly reason?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** D15: không sở hữu / không tồn tại / đã xoá => luôn 404. */
export class NotFoundError extends AppError {
  public constructor(resource: string, reason = `${resource}_not_found`) {
    super('not_found', `${resource} not found`, reason);
  }
}

export class ConflictError extends AppError {
  public constructor(
    message: string,
    reason: string,
    details?: Record<string, unknown>,
  ) {
    super('conflict', message, reason, details);
  }
}

export class ValidationError extends AppError {
  public constructor(
    public readonly errors: ReadonlyArray<{ field: string; message: string }>,
    message = 'Validation failed',
  ) {
    super('bad_request', message, 'validation_failed');
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = 'Unauthorized', reason = 'invalid_token') {
    super('unauthorized', message, reason);
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = 'Forbidden', reason = 'admin_required') {
    super('forbidden', message, reason);
  }
}

/** Lỗi khi gọi AI Engine (mạng, 5xx, stream đứt). */
export class UpstreamError extends AppError {
  public constructor(
    message: string,
    reason = 'engine_unavailable',
    details?: Record<string, unknown>,
  ) {
    super('bad_gateway', message, reason, details);
  }
}
