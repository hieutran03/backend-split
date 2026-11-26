#!/usr/bin/env node
/**
 * TypeORM CLI wrapper.
 *
 * The stock `typeorm-ts-node-commonjs` binary registers ts-node but not
 * `tsconfig-paths`, so it cannot resolve the `@platform/...` path aliases used by
 * `src/data-source.ts`. Registering both here keeps the CLI working
 * with the same import style as the rest of the codebase.
 *
 * Usage (see package.json): node scripts/typeorm.js migration:run -d src/data-source.ts
 */
const { dirname, join } = require('node:path');

require('ts-node/register');
require('tsconfig-paths/register');

const typeormRoot = dirname(require.resolve('typeorm'));
require(join(typeormRoot, 'cli.js'));
