/**
 * Seed dữ liệu dev: 2 user (để test ownership chéo user => 404).
 *   pnpm db:migrate && pnpm db:seed
 *
 * password_hash là placeholder — login thật là task AUTH-01 (bcrypt cost 12, $2b$).
 */
import 'reflect-metadata';

import dataSource from '../src/data-source';
import { DEV_USER_ID, OTHER_USER_ID } from './dev-users';

async function main(): Promise<void> {
  await dataSource.initialize();
  const now = new Date();
  for (const [id, username] of [
    [DEV_USER_ID, 'dev'],
    [OTHER_USER_ID, 'other'],
  ] as const) {
    await dataSource.query(
      `INSERT INTO users (id, created_at, updated_at, username, email, password_hash, token_version, role)
       VALUES ($1, $2, $2, $3, $4, 'not-a-real-hash', 0, 'user')
       ON CONFLICT (id) DO NOTHING`,
      [id, now, username, `${username}@example.local`],
    );
  }
  await dataSource.destroy();
  console.log(`Seeded users: dev=${DEV_USER_ID}, other=${OTHER_USER_ID}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
