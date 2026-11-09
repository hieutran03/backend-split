// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Ranh giới tầng được kiểm 2 lần:
 *  - ở đây (no-restricted-imports) để editor báo đỏ ngay khi gõ;
 *  - ở .dependency-cruiser.cjs (pnpm test:architecture) để CI chặn.
 */
const FRAMEWORK_IMPORTS = [
  { group: ['@nestjs/**'], message: 'domain/application không được biết NestJS. Khai báo port + token, wiring ở <module>.module.ts.' },
  { group: ['typeorm', 'typeorm/**', 'pg'], message: 'Không dùng TypeORM trong core. Dùng repository port.' },
  { group: ['ioredis', 'jsonwebtoken', 'express'], message: 'Hạ tầng phải đi qua port.' },
  { regex: '^@platform/(?!ports/)', message: 'Core chỉ được import @platform/ports/*.' },
];

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**', 'config/jest/**', 'scripts/**/*.js', '.dependency-cruiser.cjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'lf' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='forwardRef']", message: 'forwardRef() che giấu vòng phụ thuộc. Tách bằng port/event.' },
      ],
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts', 'src/modules/*/application/**/*.ts', 'src/shared/**/*.ts', 'src/contracts/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: FRAMEWORK_IMPORTS }] },
  },
  {
    // Nest controller/module cần decorator metadata => không được dùng `import type` cho class được inject.
    files: ['src/**/*.controller.ts', 'src/**/*.module.ts', 'src/platform/http/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/unbound-method': 'off', '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
);
