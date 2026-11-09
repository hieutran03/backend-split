import { ValidationError } from '@shared/errors/app-error';

/**
 * User aggregate — `users` table (§6).
 *
 * The password NEVER enters the domain in raw form: the domain only holds the hash
 * (bcrypt `$2b$`, cost 12 — Python compatible). Hashing/comparing is the job of the
 * PasswordHasher port in application.
 */
export type UserRole = 'user' | 'admin';

export interface UserProps {
  readonly id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  /** Incremented on soft delete / password change ⇒ invalidates all old tokens (claim `ver`). */
  tokenVersion: number;
  role: UserRole;
  readonly createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 50;
export const EMAIL_MAX = 255;
export const AVATAR_URL_MAX = 2048;

export class User {
  private constructor(private readonly props: UserProps) {}

  public static register(input: {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    avatarUrl?: string | null;
    now: Date;
  }): User {
    return new User({
      id: input.id,
      username: User.validUsername(input.username),
      email: User.normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      avatarUrl: normalizeOptional(input.avatarUrl),
      tokenVersion: 0,
      role: 'user',
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
  }

  public static restore(props: UserProps): User {
    return new User({ ...props });
  }

  /**
   * Email normalization shared by signup AND login lookup: only strips
   * surrounding whitespace. Does NOT lowercase — see TC-17 (Python data may be
   * case-sensitive, and so is the DB unique index).
   */
  public static normalizeEmail(email: string): string {
    const trimmed = email.trim();
    if (trimmed.length === 0 || trimmed.length > EMAIL_MAX) {
      throw new ValidationError([
        {
          field: 'email',
          message: `must be between 1 and ${EMAIL_MAX} characters`,
        },
      ]);
    }
    return trimmed;
  }

  public get id(): string {
    return this.props.id;
  }
  public get passwordHash(): string {
    return this.props.passwordHash;
  }
  public get tokenVersion(): number {
    return this.props.tokenVersion;
  }
  public get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  public snapshot(): Readonly<UserProps> {
    return { ...this.props };
  }

  private static validUsername(username: string): string {
    const trimmed = username.trim();
    if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX) {
      throw new ValidationError([
        {
          field: 'username',
          message: `must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters`,
        },
      ]);
    }
    return trimmed;
  }
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
