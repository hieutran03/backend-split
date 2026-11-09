const base = require('./base');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'integration',
  testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
  testTimeout: 60_000,
};
