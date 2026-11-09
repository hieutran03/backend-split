import { IsNull, QueryFailedError } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import { ConflictError } from '@shared/errors/app-error';
import { User } from '../domain/user';
import type { UserRepository } from '../application/ports';
import { UserRecord } from './records';

/** Tên unique index trong DB (Alembic) ⇒ lý do 409 trả cho client. */
const UNIQUE_REASONS: Record<string, { reason: string; message: string }> = {
  ix_users_email: {
    reason: 'email_not_available',
    message: 'Email is already registered',
  },
  ix_users_username: {
    reason: 'username_not_available',
    message: 'Username is already taken',
  },
};

export class TypeOrmUserRepository implements UserRepository {
  public constructor(private readonly db: DbContext) {}

  private get repo() {
    return this.db.manager.getRepository(UserRecord);
  }

  public async findActiveByEmail(email: string): Promise<User | null> {
    const r = await this.repo.findOneBy({ email, deletedAt: IsNull() });
    return r ? toDomain(r) : null;
  }

  public async findActiveById(id: string): Promise<User | null> {
    const r = await this.repo.findOneBy({ id, deletedAt: IsNull() });
    return r ? toDomain(r) : null;
  }

  public emailExists(email: string): Promise<boolean> {
    return this.repo.existsBy({ email });
  }

  public usernameExists(username: string): Promise<boolean> {
    return this.repo.existsBy({ username });
  }

  public async insert(user: User): Promise<void> {
    try {
      await this.repo.insert(toRecord(user));
    } catch (error) {
      const hit = uniqueViolation(error);
      if (hit) throw new ConflictError(hit.message, hit.reason);
      throw error;
    }
  }
}

function uniqueViolation(
  error: unknown,
): { reason: string; message: string } | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driver = error.driverError as { code?: string; constraint?: string };
  if (driver.code !== '23505') return null;
  return (
    UNIQUE_REASONS[driver.constraint ?? ''] ?? {
      reason: 'already_exists',
      message: 'Already exists',
    }
  );
}

function toDomain(r: UserRecord): User {
  return User.restore({
    id: r.id,
    username: r.username,
    email: r.email,
    passwordHash: r.passwordHash,
    avatarUrl: r.avatarUrl,
    tokenVersion: r.tokenVersion,
    role: r.role === 'admin' ? 'admin' : 'user',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  });
}

function toRecord(user: User): UserRecord {
  return Object.assign(new UserRecord(), user.snapshot());
}
