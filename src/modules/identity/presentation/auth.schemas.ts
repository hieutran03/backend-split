import { z } from 'zod';

import { type TokenView, type UserView } from '../application/views';
import { PASSWORD_MIN_CHARS } from '../domain/password-policy';
import {
  AVATAR_URL_MAX,
  EMAIL_MAX,
  USERNAME_MAX,
  USERNAME_MIN,
} from '../domain/user';

// ------------------------------------------------------------------ request
/** Matches Python `UserCreate`; the password's 72-byte rule is checked in the domain. */
export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN)
    .max(USERNAME_MAX)
    .meta({ example: 'hieu' }),
  email: z.email().max(EMAIL_MAX).meta({ example: 'hieu@example.com' }),
  password: z
    .string()
    .min(PASSWORD_MIN_CHARS)
    .meta({ example: 'correct-horse-battery' }),
  avatarUrl: z.string().max(AVATAR_URL_MAX).nullish(),
});
export type SignupBody = z.infer<typeof signupSchema>;

/** Matches Python `LoginRequest`. No password length rules applied here. */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1)
    .max(EMAIL_MAX)
    .meta({ example: 'hieu@example.com' }),
  password: z
    .string()
    .min(1)
    .max(1024)
    .meta({ example: 'correct-horse-battery' }),
});
export type LoginBody = z.infer<typeof loginSchema>;

// ----------------------------------------------------------------- response
export const userViewSchema: z.ZodType<UserView> = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export const tokenViewSchema: z.ZodType<TokenView> = z.object({
  accessToken: z
    .string()
    .meta({ description: 'JWT HS256, claim type=access, ver' }),
  refreshToken: z.string().meta({
    description:
      'Opaque string (not a JWT). Store securely on the client; used for /auth/refresh.',
  }),
  tokenType: z.literal('bearer'),
  expiresIn: z
    .number()
    .int()
    .meta({ description: 'accessToken lifetime in seconds', example: 900 }),
  userId: z.uuid(),
});
