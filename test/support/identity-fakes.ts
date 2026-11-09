import type {
  AccessTokenIssuer,
  IssuedRefreshToken,
  PasswordHasher,
  RefreshTokenStore,
  UserRepository,
} from '@modules/identity/application/ports';
import { User } from '@modules/identity/domain/user';
import { ConflictError } from '@shared/errors/app-error';

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

export class RecordingRefreshTokens implements RefreshTokenStore {
  public readonly issued: Array<{ userId: string; userAgent: string | null }> =
    [];
  public issue(input: {
    userId: string;
    userAgent: string | null;
    now: Date;
  }): Promise<IssuedRefreshToken> {
    this.issued.push({ userId: input.userId, userAgent: input.userAgent });
    return Promise.resolve({
      token: `refresh-${this.issued.length}`,
      expiresAt: new Date(input.now.getTime() + 1000),
    });
  }
}
