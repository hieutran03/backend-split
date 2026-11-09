import jwt from 'jsonwebtoken';

import { UnauthorizedError } from '@shared/errors/app-error';

/**
 * Signs/verifies Python-compatible HS256 access tokens (§11):
 *  - Legacy tokens: claims {sub, iat, exp, ver?}, NO `type` — accepted until they
 *    expire naturally if `acceptLegacyAccess` (D19).
 *  - New tokens: add `type: "access"`, TTL 15 minutes.
 *  - Always reject `type=refresh` and `type=widget` on the access path.
 *
 * TODO(AUTH-03): check `ver` against users.token_version + deleted_at (cache ≤ 30 s).
 */
export interface AccessClaims {
  readonly userId: string;
  readonly tokenVersion: number;
  readonly legacy: boolean;
}

export interface JwtOptions {
  readonly jwtSecret: string;
  readonly accessTtlSeconds: number;
  readonly acceptLegacyAccess: boolean;
}

export class JwtTokenService {
  public constructor(private readonly options: JwtOptions) {}

  public signAccess(
    userId: string,
    tokenVersion = 0,
  ): { token: string; expiresIn: number } {
    const token = jwt.sign(
      { sub: userId, ver: tokenVersion, type: 'access' },
      this.options.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.options.accessTtlSeconds,
      },
    );
    return { token, expiresIn: this.options.accessTtlSeconds };
  }

  public verifyAccess(token: string): AccessClaims {
    let payload: jwt.JwtPayload | string;
    try {
      payload = jwt.verify(token, this.options.jwtSecret, {
        algorithms: ['HS256'],
      });
    } catch (_error) {
      throw new UnauthorizedError('Invalid or expired token', 'invalid_token');
    }
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new UnauthorizedError('Invalid token payload', 'invalid_token');
    }
    const type: unknown = payload.type;
    if (type === undefined) {
      if (!this.options.acceptLegacyAccess) {
        throw new UnauthorizedError(
          'Legacy token no longer accepted',
          'legacy_token_rejected',
        );
      }
    } else if (type !== 'access') {
      throw new UnauthorizedError('Wrong token type', 'wrong_token_type');
    }
    const ver: unknown = payload.ver;
    return {
      userId: payload.sub,
      tokenVersion: typeof ver === 'number' ? ver : 0,
      legacy: type === undefined,
    };
  }
}
