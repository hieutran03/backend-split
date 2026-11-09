import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { type DbContext } from '@platform/database/db-context';
import type {
  IssuedRefreshToken,
  RefreshTokenStore,
} from '../application/ports';
import { RefreshTokenRecord } from './records';

/** SHA-256 hex của token — dùng chung cho lúc phát hành và lúc tra cứu (AUTH-02). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Refresh token OPAQUE (A2): 32 byte ngẫu nhiên, base64url (43 ký tự).
 * Không phải JWT ⇒ không tự giải mã được, chỉ có giá trị khi tra trong DB.
 * DB chỉ giữ SHA-256 — lộ DB không lộ token dùng được.
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
