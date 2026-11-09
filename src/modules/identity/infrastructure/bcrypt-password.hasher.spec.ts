import bcrypt from 'bcrypt';

import { BcryptPasswordHasher } from './bcrypt-password.hasher';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher(4); // cost thấp cho test nhanh

  it('sinh hash định dạng $2b$ giống Python bcrypt.hashpw', async () => {
    const hash = await hasher.hash('secret-123');
    expect(hash).toMatch(/^\$2b\$04\$/);
    await expect(hasher.verify('secret-123', hash)).resolves.toBe(true);
    await expect(hasher.verify('secret-124', hash)).resolves.toBe(false);
  });

  it('verify được hash $2b$ cost 12 (định dạng Python ghi vào DB)', async () => {
    const pythonStyle = bcrypt.hashSync('legacy-pass', 12);
    expect(pythonStyle.startsWith('$2b$12$')).toBe(true);
    await expect(hasher.verify('legacy-pass', pythonStyle)).resolves.toBe(true);
  });

  it('hash hỏng ⇒ false, không ném lỗi (tránh 500)', async () => {
    await expect(hasher.verify('x', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });
});
