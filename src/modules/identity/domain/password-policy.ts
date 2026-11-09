import { ValidationError } from '@shared/errors/app-error';

/**
 * Password rules at SIGNUP (not applied at login — old accounts may have
 * passwords that do not follow the new rules).
 *
 * - At least 8 characters (same as Python `UserCreate.password minLength 8`).
 * - At most 72 UTF-8 BYTES: bcrypt only uses the first 72 bytes, the rest is silently ignored.
 *   Reject up front so users do not believe a longer password is safer (TC-18).
 */
export const PASSWORD_MIN_CHARS = 8;
export const PASSWORD_MAX_BYTES = 72;

const encoder = new TextEncoder();

export function assertPasswordAcceptable(password: string): void {
  if (password.length < PASSWORD_MIN_CHARS) {
    throw new ValidationError([
      {
        field: 'password',
        message: `must be at least ${PASSWORD_MIN_CHARS} characters`,
      },
    ]);
  }
  if (encoder.encode(password).length > PASSWORD_MAX_BYTES) {
    throw new ValidationError([
      {
        field: 'password',
        message: `must be at most ${PASSWORD_MAX_BYTES} bytes (UTF-8)`,
      },
    ]);
  }
}
