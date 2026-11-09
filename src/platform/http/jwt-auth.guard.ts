import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError, UnauthorizedError } from '@shared/errors/app-error';
import {
  USER_TOKEN_STATE_READER,
  type UserTokenStateReader,
} from '@platform/ports/user-token-state.port';
import { JwtTokenService } from '../auth/jwt-token.service';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import {
  type AuthenticatedRequest,
  IS_ADMIN_ONLY,
  IS_PUBLIC,
} from './decorators';

/**
 * Global guard for /api/v1. By default EVERY route needs an access token; opt out with @Public().
 *
 * Order of checks:
 *  1. Bearer token present, signature + expiry + type valid (JwtTokenService).
 *  2. The user still exists and is not soft-deleted            -> else 401 user_inactive.
 *  3. The token's `ver` claim equals users.token_version         -> else 401 token_revoked.
 *     A missing `ver` (legacy Python token) counts as 0 (§11).
 *  4. @AdminOnly routes require an admin                         -> else 403 admin_required.
 *
 * Steps 2–3 read through a ≤ 30 s cache (UserTokenStateReader), so a deletion or a
 * version bump takes effect within that window — same guarantee as the Python API.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly tokens: JwtTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(USER_TOKEN_STATE_READER)
    private readonly userStates: UserTokenStateReader,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const state = await this.userStates.read(claims.userId);
    if (!state || !state.active) {
      throw new UnauthorizedError(
        'Account is no longer active',
        'user_inactive',
      );
    }
    if (state.tokenVersion !== claims.tokenVersion) {
      throw new UnauthorizedError(
        'Token is no longer valid, please log in again',
        'token_revoked',
      );
    }

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
