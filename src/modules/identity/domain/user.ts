import { ValidationError } from '@shared/errors/app-error';

/**
 * Aggregate User — bảng `users` (§6).
 *
 * Mật khẩu KHÔNG bao giờ đi vào domain dưới dạng thô: domain chỉ giữ hash
 * (bcrypt `$2b$`, cost 12 — tương thích Python). Băm/so khớp là việc của port
 * PasswordHasher ở application.
 */
export type UserRole = 'user' | 'admin';

export interface UserProps {
  readonly id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  /** Tăng khi xoá mềm / đổi mật khẩu ⇒ vô hiệu mọi token cũ (claim `ver`). */
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
   * Chuẩn hoá email dùng chung cho đăng ký VÀ tra cứu khi đăng nhập: chỉ bỏ
   * khoảng trắng hai đầu. KHÔNG hạ chữ thường — xem TC-17 (dữ liệu Python có thể
   * đang phân biệt hoa/thường, unique index của DB cũng phân biệt).
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
