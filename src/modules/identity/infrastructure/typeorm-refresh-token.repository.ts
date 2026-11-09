import { IsNull } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import { RefreshToken } from '../domain/refresh-token';
import type { RefreshTokenRepository } from '../application/ports';
import { RefreshTokenRecord } from './records';

export class TypeOrmRefreshTokenRepository implements RefreshTokenRepository {
  public constructor(private readonly db: DbContext) {}

  private get repo() {
    return this.db.manager.getRepository(RefreshTokenRecord);
  }

  public async insert(token: RefreshToken): Promise<void> {
    await this.repo.insert(toRecord(token));
  }

  public async findByHashForUpdate(
    tokenHash: string,
  ): Promise<RefreshToken | null> {
    // Row lock only makes sense inside a transaction; outside one, read plainly.
    const record = await this.repo.findOne({
      where: { tokenHash },
      ...(this.db.inTransaction ? { lock: { mode: 'pessimistic_write' } } : {}),
    });
    return record ? toDomain(record) : null;
  }

  public async save(token: RefreshToken): Promise<void> {
    const { id, ...rest } = toRecord(token);
    await this.repo.update({ id }, rest);
  }

  public async revokeChainFrom(tokenId: string, now: Date): Promise<number> {
    // Walk the rotation chain forwards (token -> replaced_by_id -> ...) and revoke every
    // link still active. The chain is short (one link per refresh), so a recursive CTE
    // is cheap; UNION (not UNION ALL) also stops on an accidental cycle.
    const rows: unknown = await this.db.manager.query(
      `WITH RECURSIVE chain AS (
         SELECT id, replaced_by_id FROM refresh_tokens WHERE id = $1
         UNION
         SELECT r.id, r.replaced_by_id
           FROM refresh_tokens r JOIN chain c ON r.id = c.replaced_by_id
       )
       UPDATE refresh_tokens SET revoked_at = $2
        WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL
       RETURNING id`,
      [tokenId, now],
    );
    return affectedRows(rows);
  }

  public async revokeAllForUser(userId: string, now: Date): Promise<number> {
    const result = await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: now },
    );
    return result.affected ?? 0;
  }
}

/** pg returns `[rows, count]` for UPDATE … RETURNING through TypeORM's query(). */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') return result[1];
  if (Array.isArray(result) && Array.isArray(result[0]))
    return result[0].length;
  return Array.isArray(result) ? result.length : 0;
}

function toDomain(r: RefreshTokenRecord): RefreshToken {
  return RefreshToken.restore({
    id: r.id,
    userId: r.userId,
    tokenHash: r.tokenHash,
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
    replacedById: r.replacedById,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
  });
}

function toRecord(token: RefreshToken): RefreshTokenRecord {
  return Object.assign(new RefreshTokenRecord(), token.snapshot());
}
