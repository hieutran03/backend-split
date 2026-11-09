const base = require('./base');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'unit',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: ['src/modules/**/{domain,application}/**/*.ts', 'src/shared/**/*.ts', '!src/**/*.spec.ts'],
  coverageDirectory: '<rootDir>/coverage/unit',
};
