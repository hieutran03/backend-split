import { createHash, randomBytes } from 'node:crypto';

import { type JwtTokenService } from '@platform/auth/jwt-token.service';
import type {
  LegacyRefreshTokenVerifier,
  OpaqueTokenGenerator,
} from '../application/ports';

/**
 * Opaque refresh token: 32 random bytes, base64url (43 chars, no dots — so it can
 * never be mistaken for a legacy JWT). Only the SHA-256 hex is stored: a leaked
 * database does not leak usable tokens.
 */
export class CryptoOpaqueTokenGenerator implements OpaqueTokenGenerator {
  public generate(): string {
    return randomBytes(32).toString('base64url');
  }

  public hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** Adapter: identity port -> platform JwtTokenService (legacy Python refresh JWT, D19). */
export class JwtLegacyRefreshTokenVerifier implements LegacyRefreshTokenVerifier {
  public constructor(private readonly jwt: JwtTokenService) {}

  public verify(token: string): { userId: string; tokenVersion: number } {
    return this.jwt.verifyLegacyRefresh(token);
  }
}
