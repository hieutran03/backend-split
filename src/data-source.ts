import 'reflect-metadata';

import { join } from 'node:path';

import { loadConfig } from '@platform/config/app-config';
import { createDataSource } from '@platform/database/database.module';
import { ALL_ENTITIES } from './app.entities';

/**
 * DataSource for the TypeORM CLI only (pnpm db:migrate*). Migrations table: backend_migrations.
 *
 * Migrations are GENERATED from the entities (pnpm db:migrate:generate <Name>) and picked
 * up from the migrations folder by glob, so a generated file needs no manual registration.
 */
export default createDataSource(loadConfig().database, ALL_ENTITIES, [
  join(__dirname, 'platform', 'database', 'migrations', '*.{ts,js}'),
]);
