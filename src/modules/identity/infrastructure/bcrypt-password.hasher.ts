import bcrypt from 'bcrypt';

import type { PasswordHasher } from '../application/ports';

/**
 * bcrypt native — sinh `$2b$<cost>$…`, đọc được `$2a$`/`$2b$`/`$2y$`.
 * Python dùng `bcrypt.hashpw` cost 12 (§11) ⇒ hash cũ trong DB verify được trực tiếp.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  /** Hash giả để `burnTime` tốn đúng thời gian của một lần verify thật. */
  private readonly dummyHash: string;

  public constructor(private readonly cost: number) {
    this.dummyHash = bcrypt.hashSync('timing-equaliser', cost);
  }

  public hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  public verify(plain: string, hash: string): Promise<boolean> {
    // Hash hỏng/định dạng lạ ⇒ coi như sai mật khẩu, không ném 500.
    return bcrypt.compare(plain, hash).catch(() => false);
  }

  public async burnTime(plain: string): Promise<void> {
    await bcrypt.compare(plain, this.dummyHash);
  }
}
