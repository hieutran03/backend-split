import 'reflect-metadata';

import { loadConfig } from '@platform/config/app-config';
import { createDataSource } from '@platform/database/database.module';
import { ALL_ENTITIES, ALL_MIGRATIONS } from './app.entities';

/** Dùng cho TypeORM CLI (pnpm db:migrate). Bảng migration: backend_migrations. */
export default createDataSource(
  loadConfig().database,
  ALL_ENTITIES,
  ALL_MIGRATIONS,
);
