import { type DbContext } from '@platform/database/db-context';
import type { Clock } from '@platform/ports/kernel.port';
import type {
  UserTokenState,
  UserTokenStateReader,
} from '@platform/ports/user-token-state.port';
import { UserRecord } from './records';

/** Reads token_version + deleted_at straight from `users` (one indexed PK lookup). */
export class TypeOrmUserTokenStateReader implements UserTokenStateReader {
  public constructor(private readonly db: DbContext) {}

  public async read(userId: string): Promise<UserTokenState | null> {
    const row = await this.db.manager.getRepository(UserRecord).findOne({
      where: { id: userId },
      select: { id: true, tokenVersion: true, deletedAt: true },
    });
    if (!row) return null;
    return { tokenVersion: row.tokenVersion, active: row.deletedAt === null };
  }

  public invalidate(): void {
    // Nothing cached here.
  }
}

interface Entry {
  readonly value: UserTokenState | null;
  readonly expiresAt: number;
}

/**
 * Per-process TTL cache in front of the DB reader, mirroring Python's 30 s in-process
 * cache: a soft-deleted user or a bumped token_version takes effect within `ttlMs`.
 *
 * Bounded: when full, the oldest entry is evicted (Map keeps insertion order), so a
 * flood of distinct user ids cannot grow memory without limit. Unknown users (null)
 * are cached too, so a forged `sub` cannot hammer the database.
 *
 * Multi-replica note: each replica has its own cache; staleness is bounded by ttlMs
 * everywhere, which is what the spec allows (≤ 30 s).
 */
export class CachedUserTokenStateReader implements UserTokenStateReader {
  private readonly entries = new Map<string, Entry>();

  public constructor(
    private readonly inner: UserTokenStateReader,
    private readonly clock: Clock,
    private readonly ttlMs: number,
    private readonly maxEntries = 10_000,
  ) {}

  public async read(userId: string): Promise<UserTokenState | null> {
    const now = this.clock.now().getTime();
    const hit = this.entries.get(userId);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = await this.inner.read(userId);
    this.entries.delete(userId);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(userId, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  public invalidate(userId: string): void {
    this.entries.delete(userId);
    this.inner.invalidate(userId);
  }
}
