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

/** Route không cần JWT (signup, login, health...). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC, true);

/** Chỉ admin. User thường => 403 admin_required (403 CHỈ dùng cho role, D15). */
export const AdminOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_ADMIN_ONLY, true);

/** Không bọc envelope (stream SSE/NDJSON, file nhị phân, Prometheus). */
export const RawResponse = (): MethodDecorator =>
  SetMetadata(RAW_RESPONSE, true);

/** Message trong envelope thành công. Mặc định "OK". */
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE, message);

export interface AuthenticatedRequest extends Request {
  actor?: Actor;
}

/** Inject Actor đã xác thực vào handler. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.actor) {
      throw new Error('CurrentActor dùng trên route @Public — lỗi lập trình');
    }
    return request.actor;
  },
);
