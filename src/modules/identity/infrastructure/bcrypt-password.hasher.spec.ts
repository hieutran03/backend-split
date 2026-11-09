import bcrypt from 'bcrypt';

import { BcryptPasswordHasher } from './bcrypt-password.hasher';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher(4); // low cost for fast tests

  it('produces a $2b$ hash like Python bcrypt.hashpw', async () => {
    const hash = await hasher.hash('secret-123');
    expect(hash).toMatch(/^\$2b\$04\$/);
    await expect(hasher.verify('secret-123', hash)).resolves.toBe(true);
    await expect(hasher.verify('secret-124', hash)).resolves.toBe(false);
  });

  it('verifies a $2b$ cost 12 hash (the format Python writes to the DB)', async () => {
    const pythonStyle = bcrypt.hashSync('legacy-pass', 12);
    expect(pythonStyle.startsWith('$2b$12$')).toBe(true);
    await expect(hasher.verify('legacy-pass', pythonStyle)).resolves.toBe(true);
  });

  it('malformed hash ⇒ false, does not throw (avoids 500)', async () => {
    await expect(hasher.verify('x', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });
});
