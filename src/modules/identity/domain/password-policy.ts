import { ValidationError } from '@shared/errors/app-error';

/**
 * Luật mật khẩu khi ĐĂNG KÝ (không áp cho đăng nhập — tài khoản cũ có thể có
 * mật khẩu không theo luật mới).
 *
 * - Tối thiểu 8 ký tự (giống Python `UserCreate.password minLength 8`).
 * - Tối đa 72 BYTE UTF-8: bcrypt chỉ dùng 72 byte đầu, phần sau bị bỏ qua âm thầm.
 *   Chặn ngay để người dùng không tưởng mật khẩu dài hơn là an toàn hơn (TC-18).
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
