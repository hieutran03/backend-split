import 'reflect-metadata';

import { loadConfig } from '@platform/config/app-config';
import { createDataSource } from '@platform/database/database.module';
import { ALL_ENTITIES, ALL_MIGRATIONS } from './app.entities';

/** Used by the TypeORM CLI (pnpm db:migrate). Migrations table: backend_migrations. */
export default createDataSource(
  loadConfig().database,
  ALL_ENTITIES,
  ALL_MIGRATIONS,
);
