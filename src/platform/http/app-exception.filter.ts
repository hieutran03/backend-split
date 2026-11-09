import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Response } from 'express';

import {
  AppError,
  type ErrorCode,
  ValidationError,
} from '@shared/errors/app-error';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  unprocessable: 422,
  too_many_requests: 429,
  bad_gateway: 502,
  service_unavailable: 503,
  internal_error: 500,
};

const CODE_BY_STATUS: Record<number, ErrorCode> = Object.fromEntries(
  Object.entries(STATUS).map(([code, status]) => [status, code as ErrorCode]),
);

/**
 * Maps every error to the standard envelope (§4.1 S1, S6):
 *   { success: false, code, message, data: { reason?, errors?, ...details } }
 * 500 only for unexpected errors — without leaking stack traces/internal messages.
 *
 * For streaming routes: once headers are sent (mid-stream) the filter can no longer write,
 * so the projector must emit the final error event itself (S7).
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      this.logger.error(
        'Error after headers sent',
        exception instanceof Error ? exception.stack : String(exception),
      );
      response.end();
      return;
    }
    const { status, body } = this.toBody(exception);
    if (status >= 500) {
      this.logger.error(
        body.message,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(status).json(body);
  }

  private toBody(exception: unknown): {
    status: number;
    body: {
      success: false;
      code: ErrorCode;
      message: string;
      data: Record<string, unknown> | null;
    };
  } {
    if (exception instanceof ValidationError) {
      return {
        status: 400,
        body: {
          success: false,
          code: 'bad_request',
          message: exception.message,
          data: { errors: exception.errors },
        },
      };
    }
    if (exception instanceof AppError) {
      const data =
        exception.reason || exception.details
          ? { reason: exception.reason, ...exception.details }
          : null;
      return {
        status: STATUS[exception.code],
        body: {
          success: false,
          code: exception.code,
          message: exception.message,
          data,
        },
      };
    }
    if (exception instanceof HttpException) {
      // Errors raised by Nest/Express (404 route, 413 body too large, malformed JSON...).
      const status = exception.getStatus();
      return {
        status,
        body: {
          success: false,
          code:
            CODE_BY_STATUS[status] ??
            (status >= 500 ? 'internal_error' : 'bad_request'),
          message: exception.message,
          data: null,
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        code: 'internal_error',
        message: 'Internal server error',
        data: null,
      },
    };
  }
}
