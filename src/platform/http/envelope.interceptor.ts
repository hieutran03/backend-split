import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, map } from 'rxjs';

import { RAW_RESPONSE, RESPONSE_MESSAGE } from './decorators';

/** New standard success envelope (§4.1 S1): code is always present. */
export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly code: 'ok';
  readonly message: string;
  readonly data: T;
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  public constructor(private readonly reflector: Reflector) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const handler = context.getHandler();
    if (this.reflector.get<boolean>(RAW_RESPONSE, handler))
      return next.handle();
    const message =
      this.reflector.get<string>(RESPONSE_MESSAGE, handler) ?? 'OK';
    return next.handle().pipe(
      map((data: unknown): SuccessEnvelope<unknown> => ({
        success: true,
        code: 'ok',
        message,
        data: data ?? null,
      })),
    );
  }
}
