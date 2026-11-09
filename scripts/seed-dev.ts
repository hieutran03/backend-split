/**
 * Seed dữ liệu dev: 2 user (để test ownership chéo user => 404).
 *   pnpm db:migrate && pnpm db:seed
 *
 * Mật khẩu dev của cả hai user: DEV_PASSWORD trong scripts/dev-users.ts (bcrypt cost 12).
 * Chạy lại seed sẽ cập nhật password_hash (tiện khi seed cũ dùng hash giả).
 */
import 'reflect-metadata';

import bcrypt from 'bcrypt';

import dataSource from '../src/data-source';
import { DEV_PASSWORD, DEV_USER_ID, OTHER_USER_ID } from './dev-users';

async function main(): Promise<void> {
  await dataSource.initialize();
  const now = new Date();
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  for (const [id, username] of [
    [DEV_USER_ID, 'dev'],
    [OTHER_USER_ID, 'other'],
  ] as const) {
    await dataSource.query(
      `INSERT INTO users (id, created_at, updated_at, username, email, password_hash, token_version, role)
       VALUES ($1, $2, $2, $3, $4, $5, 0, 'user')
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [id, now, username, `${username}@example.local`, passwordHash],
    );
  }
  await dataSource.destroy();
  console.log(`Seeded users: dev=${DEV_USER_ID}, other=${OTHER_USER_ID}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
