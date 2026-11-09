import type { User } from '../domain/user';

/**
 * Port outbound của context identity. Mỗi port một token; adapter ở infrastructure/.
 */

export interface UserRepository {
  /** Tìm user CHƯA xoá theo email (khớp chính xác sau trim — TC-17). */
  findActiveByEmail(email: string): Promise<User | null>;
  findActiveById(id: string): Promise<User | null>;
  /** Kiểm trên MỌI row, kể cả đã xoá mềm — vì unique index của DB không lọc deleted_at. */
  emailExists(email: string): Promise<boolean>;
  usernameExists(username: string): Promise<boolean>;
  /**
   * Ném ConflictError (email_not_available | username_not_available) nếu vi phạm
   * unique — chặn trường hợp hai request đăng ký trùng chạy song song.
   */
  insert(user: User): Promise<void>;
}
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
  /**
   * So khớp với một hash giả để thời gian phản hồi "email không tồn tại" bằng
   * "sai mật khẩu" — không cho dò email nào đã đăng ký qua độ trễ.
   */
  burnTime(plain: string): Promise<void>;
}
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface AccessTokenIssuer {
  issue(
    userId: string,
    tokenVersion: number,
  ): { token: string; expiresIn: number };
}
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');

export interface IssuedRefreshToken {
  /** Chuỗi opaque trả cho client — CHỈ xuất hiện đúng một lần, DB lưu SHA-256. */
  readonly token: string;
  readonly expiresAt: Date;
}

export interface RefreshTokenStore {
  issue(input: {
    userId: string;
    userAgent: string | null;
    now: Date;
  }): Promise<IssuedRefreshToken>;
}
export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');
