/**
 * What the access-token guard needs to know about a user on every request (§11
 * "Token version"): is the account still active, and which token version is current.
 *
 * Declared in platform (the guard lives here) and implemented by the identity module,
 * which owns the `users` table — platform never imports a business module.
 */
export interface UserTokenState {
  readonly tokenVersion: number;
  readonly active: boolean;
}

export interface UserTokenStateReader {
  /** null => the user does not exist. */
  read(userId: string): Promise<UserTokenState | null>;
  /** Drop any cached state, e.g. right after this process bumped token_version. */
  invalidate(userId: string): void;
}

export const USER_TOKEN_STATE_READER = Symbol('USER_TOKEN_STATE_READER');
