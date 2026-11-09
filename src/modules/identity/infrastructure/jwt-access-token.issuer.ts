import { type JwtTokenService } from '@platform/auth/jwt-token.service';
import type { AccessTokenIssuer } from '../application/ports';

/** Adapter: port của identity → JwtTokenService của platform (HS256, type=access, ver). */
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  public constructor(private readonly jwt: JwtTokenService) {}

  public issue(
    userId: string,
    tokenVersion: number,
  ): { token: string; expiresIn: number } {
    return this.jwt.signAccess(userId, tokenVersion);
  }
}
