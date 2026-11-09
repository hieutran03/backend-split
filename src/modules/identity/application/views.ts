import type { User } from '../domain/user';

/** Keeps the exact field names of Python `UserRead` + the new `role` (A1). */
export interface UserView {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly role: 'user' | 'admin';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export function toUserView(user: User): UserView {
  const u = user.snapshot();
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
  };
}

/** Keeps the exact field names of Python `TokenResponse` (A2). */
export interface TokenView {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'bearer';
  /** Seconds. New: 900 (15 minutes); old Python: 36000. */
  readonly expiresIn: number;
  readonly userId: string;
}
