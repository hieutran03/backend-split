import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError, UnauthorizedError } from '@shared/errors/app-error';
import { JwtTokenService } from '../auth/jwt-token.service';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import {
  type AuthenticatedRequest,
  IS_ADMIN_ONLY,
  IS_PUBLIC,
} from './decorators';

/**
 * Guard toàn cục cho /api/v1. Mặc định MỌI route cần access token; mở bằng @Public().
 *
 * TODO(AUTH-03): kiểm claim `ver` với users.token_version và users.deleted_at
 * (cache ≤ 30 s) — cần port UserTokenStateReader do module auth cung cấp.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly tokens: JwtTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Missing bearer token', 'missing_token');
    }
    const claims = this.tokens.verifyAccess(token);
    request.actor = {
      userId: claims.userId,
      isAdmin: this.config.auth.adminUserIds.includes(claims.userId),
    };

    if (
      this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ONLY, targets) &&
      !request.actor.isAdmin
    ) {
      throw new ForbiddenError('Admin role required', 'admin_required');
    }
    return true;
  }
}
