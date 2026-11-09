import type { RefreshToken } from '../domain/refresh-token';
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

export interface RefreshTokenRepository {
  insert(token: RefreshToken): Promise<void>;
  /**
   * Looks a token up by its SHA-256. Inside a transaction the row is locked
   * (SELECT … FOR UPDATE) so two concurrent refreshes of the same token serialise:
   * the second one sees it revoked and is treated as reuse (A3, single-flight rule).
   */
  findByHashForUpdate(tokenHash: string): Promise<RefreshToken | null>;
  save(token: RefreshToken): Promise<void>;
  /** Revokes the token and every successor reachable via replaced_by_id. Returns rows revoked. */
  revokeChainFrom(tokenId: string, now: Date): Promise<number>;
  /** Revokes every active refresh token of the user (logout from all devices). */
  revokeAllForUser(userId: string, now: Date): Promise<number>;
}
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

/** Produces opaque refresh token values and the hash stored for them. */
export interface OpaqueTokenGenerator {
  generate(): string;
  hash(token: string): string;
}
export const OPAQUE_TOKEN_GENERATOR = Symbol('OPAQUE_TOKEN_GENERATOR');

/** Verifies a legacy Python refresh JWT (D19). Throws 401 invalid_refresh_token when invalid. */
export interface LegacyRefreshTokenVerifier {
  verify(token: string): { userId: string; tokenVersion: number };
}
export const LEGACY_REFRESH_TOKEN_VERIFIER = Symbol(
  'LEGACY_REFRESH_TOKEN_VERIFIER',
);
