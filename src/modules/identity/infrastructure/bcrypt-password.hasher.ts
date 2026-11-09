import bcrypt from 'bcrypt';

import type { PasswordHasher } from '../application/ports';

/**
 * Native bcrypt — produces `$2b$<cost>$…`, reads `$2a$`/`$2b$`/`$2y$`.
 * Python uses `bcrypt.hashpw` cost 12 (§11) ⇒ old hashes in the DB verify directly.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  /** Dummy hash so `burnTime` takes exactly as long as one real verify. */
  private readonly dummyHash: string;

  public constructor(private readonly cost: number) {
    this.dummyHash = bcrypt.hashSync('timing-equaliser', cost);
  }

  public hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  public verify(plain: string, hash: string): Promise<boolean> {
    // Malformed/unknown hash format ⇒ treat as wrong password, do not throw 500.
    return bcrypt.compare(plain, hash).catch(() => false);
  }

  public async burnTime(plain: string): Promise<void> {
    await bcrypt.compare(plain, this.dummyHash);
  }
}
