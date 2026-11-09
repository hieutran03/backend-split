import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { type DbContext } from '@platform/database/db-context';
import type {
  IssuedRefreshToken,
  RefreshTokenStore,
} from '../application/ports';
import { RefreshTokenRecord } from './records';

/** Hex SHA-256 of the token — shared by issuing and lookup (AUTH-02). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * OPAQUE refresh token (A2): 32 random bytes, base64url (43 characters).
 * Not a JWT ⇒ cannot be self-decoded, only meaningful when looked up in the DB.
 * The DB keeps only the SHA-256 — a DB leak does not leak usable tokens.
 */
export class TypeOrmRefreshTokenStore implements RefreshTokenStore {
  public constructor(
    private readonly db: DbContext,
    private readonly ttlSeconds: number,
  ) {}

  public async issue(input: {
    userId: string;
    userAgent: string | null;
    now: Date;
  }): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(input.now.getTime() + this.ttlSeconds * 1000);
    await this.db.manager.insert(RefreshTokenRecord, {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: hashRefreshToken(token),
      expiresAt,
      revokedAt: null,
      replacedById: null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      createdAt: input.now,
    });
    return { token, expiresAt };
  }
}
