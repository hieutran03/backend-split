#!/usr/bin/env node
/**
 * Generates a TypeORM migration from the difference between the entities and the
 * CURRENT database (run `pnpm db:migrate` first so the DB is up to date).
 *
 *   pnpm db:migrate:generate AddConversations
 *
 * Writes src/platform/database/migrations/<timestamp>-<Name>.ts with pretty-printed SQL.
 * Never hand-write migration SQL: change the Record classes, then generate, then review
 * the generated file against docs/reference/database-schema.md.
 */
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const name = process.argv[2];
if (!name || !/^[A-Z][A-Za-z0-9]+$/.test(name)) {
  console.error('Usage: pnpm db:migrate:generate <PascalCaseName>   e.g. AddConversations');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    join(__dirname, 'typeorm.js'),
    'migration:generate',
    '--pretty',
    '-d',
    'src/data-source.ts',
    `src/platform/database/migrations/${name}`,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
