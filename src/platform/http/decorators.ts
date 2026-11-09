import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { type Request } from 'express';

import { type Actor } from '@shared/auth/actor';

export const IS_PUBLIC = 'http:isPublic';
export const IS_ADMIN_ONLY = 'http:isAdminOnly';
export const RAW_RESPONSE = 'http:rawResponse';
export const RESPONSE_MESSAGE = 'http:responseMessage';

/** Route that does not require a JWT (signup, login, health...). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC, true);

/** Admin only. Regular users => 403 admin_required (403 is used ONLY for roles, D15). */
export const AdminOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_ADMIN_ONLY, true);

/** Do not wrap in the envelope (SSE/NDJSON streams, binary files, Prometheus). */
export const RawResponse = (): MethodDecorator =>
  SetMetadata(RAW_RESPONSE, true);

/** Message in the success envelope. Defaults to "OK". */
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE, message);

export interface AuthenticatedRequest extends Request {
  actor?: Actor;
}

/** Injects the authenticated Actor into the handler. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.actor) {
      throw new Error('CurrentActor used on a @Public route — programming error');
    }
    return request.actor;
  },
);
