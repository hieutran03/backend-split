import type {
  AccessTokenIssuer,
  LegacyRefreshTokenVerifier,
  OpaqueTokenGenerator,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from '@modules/identity/application/ports';
import { RefreshToken } from '@modules/identity/domain/refresh-token';
import { User } from '@modules/identity/domain/user';
import { ConflictError, UnauthorizedError } from '@shared/errors/app-error';

export class InMemoryUserRepository implements UserRepository {
  public readonly rows = new Map<string, User>();

  private all(): User[] {
    return [...this.rows.values()];
  }

  public findActiveByEmail(email: string): Promise<User | null> {
    const u = this.all().find(
      (x) => x.snapshot().email === email && !x.isDeleted,
    );
    return Promise.resolve(u ? User.restore(u.snapshot()) : null);
  }

  public findActiveById(id: string): Promise<User | null> {
    const u = this.rows.get(id);
    return Promise.resolve(
      u && !u.isDeleted ? User.restore(u.snapshot()) : null,
    );
  }

  public emailExists(email: string): Promise<boolean> {
    return Promise.resolve(
      this.all().some((x) => x.snapshot().email === email),
    );
  }

  public usernameExists(username: string): Promise<boolean> {
    return Promise.resolve(
      this.all().some((x) => x.snapshot().username === username),
    );
  }

  public async insert(user: User): Promise<void> {
    // Simulates the DB unique index (blocks races between the check and the write).
    if (await this.emailExists(user.snapshot().email)) {
      throw new ConflictError(
        'Email is already registered',
        'email_not_available',
      );
    }
    this.rows.set(user.id, User.restore(user.snapshot()));
  }

  /** Test helper: marks as soft-deleted. */
  public softDelete(id: string): void {
    const u = this.rows.get(id);
    if (u)
      this.rows.set(
        id,
        User.restore({ ...u.snapshot(), deletedAt: new Date() }),
      );
  }
}

/** Readable dummy hash: "hashed:<plain>". Counts burnTime calls to test email-probing protection. */
export class FakePasswordHasher implements PasswordHasher {
  public burned = 0;
  public hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }
  public verify(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
  public burnTime(): Promise<void> {
    this.burned += 1;
    return Promise.resolve();
  }
}

export class FakeAccessTokens implements AccessTokenIssuer {
  public issue(
    userId: string,
    tokenVersion: number,
  ): { token: string; expiresIn: number } {
    return { token: `access:${userId}:v${tokenVersion}`, expiresIn: 900 };
  }
}

/** Deterministic opaque tokens: "rt-1", "rt-2", … with hash "h(rt-1)". */
export class SequentialTokenGenerator implements OpaqueTokenGenerator {
  private n = 0;
  public generate(): string {
    this.n += 1;
    return `rt-${this.n}`;
  }
  public hash(token: string): string {
    return `h(${token})`;
  }
}

/** In-memory refresh_tokens with the same chain semantics as the SQL recursive CTE. */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  public readonly rows = new Map<string, RefreshToken>();

  public insert(token: RefreshToken): Promise<void> {
    const hash = token.snapshot().tokenHash;
    if ([...this.rows.values()].some((t) => t.snapshot().tokenHash === hash)) {
      throw new Error('unique violation: token_hash');
    }
    this.rows.set(token.id, RefreshToken.restore(token.snapshot()));
    return Promise.resolve();
  }

  public findByHashForUpdate(tokenHash: string): Promise<RefreshToken | null> {
    const t = [...this.rows.values()].find(
      (x) => x.snapshot().tokenHash === tokenHash,
    );
    return Promise.resolve(t ? RefreshToken.restore(t.snapshot()) : null);
  }

  public save(token: RefreshToken): Promise<void> {
    this.rows.set(token.id, RefreshToken.restore(token.snapshot()));
    return Promise.resolve();
  }

  public revokeChainFrom(tokenId: string, now: Date): Promise<number> {
    let count = 0;
    const seen = new Set<string>();
    let id: string | null = tokenId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const t = this.rows.get(id);
      if (!t) break;
      const p = t.snapshot();
      if (p.revokedAt === null) {
        this.rows.set(id, RefreshToken.restore({ ...p, revokedAt: now }));
        count += 1;
      }
      id = p.replacedById;
    }
    return Promise.resolve(count);
  }

  public revokeAllForUser(userId: string, now: Date): Promise<number> {
    let count = 0;
    for (const [id, t] of this.rows) {
      const p = t.snapshot();
      if (p.userId === userId && p.revokedAt === null) {
        this.rows.set(id, RefreshToken.restore({ ...p, revokedAt: now }));
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  /** Test helper: the active (not revoked) tokens. */
  public active(): RefreshToken[] {
    return [...this.rows.values()].filter((t) => !t.isRevoked);
  }
}

/** Accepts "legacy.<userId>.v<ver>" as a valid legacy refresh JWT; anything else is invalid. */
export class FakeLegacyRefreshVerifier implements LegacyRefreshTokenVerifier {
  public verify(token: string): { userId: string; tokenVersion: number } {
    const m = /^legacy\.(.+)\.v(\d+)$/.exec(token);
    if (!m?.[1] || !m[2]) {
      throw new UnauthorizedError(
        'Invalid refresh token',
        'invalid_refresh_token',
      );
    }
    return { userId: m[1], tokenVersion: Number(m[2]) };
  }
}
