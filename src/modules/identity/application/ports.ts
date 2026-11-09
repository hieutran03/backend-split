import type { User } from '../domain/user';

/**
 * Outbound ports of the identity context. One token per port; adapters live in infrastructure/.
 */

export interface UserRepository {
  /** Finds a NON-deleted user by email (exact match after trim — TC-17). */
  findActiveByEmail(email: string): Promise<User | null>;
  findActiveById(id: string): Promise<User | null>;
  /** Checks EVERY row, soft-deleted included — the DB unique index does not filter deleted_at. */
  emailExists(email: string): Promise<boolean>;
  usernameExists(username: string): Promise<boolean>;
  /**
   * Throws ConflictError (email_not_available | username_not_available) on a unique
   * violation — covers two duplicate signup requests running concurrently.
   */
  insert(user: User): Promise<void>;
}
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
  /**
   * Compares against a dummy hash so the "unknown email" response time matches
   * "wrong password" — prevents probing registered emails via latency.
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
  /** Opaque string returned to the client — appears EXACTLY once; the DB stores SHA-256. */
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
