/**
 * Trọng tài kiến trúc (pnpm test:architecture). Bản rút gọn từ repo platform.
 *
 *  1. domain/application thuần TypeScript: không npm (trừ zod ở application), không node builtin.
 *  2. Dependency hướng vào trong: domain <- application <- infrastructure/presentation <- <module>.module.ts.
 *  3. Module không import ruột của module khác. Chỉ qua `src/modules/<x>/public-api.ts`.
 *  4. shared/ và contracts/ không biết gì về modules/ hay platform/ (trừ contracts -> zod).
 *  5. platform/ không import modules/.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain chỉ được import shared/ và chính domain của module.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: {
        pathNot: ['^src/modules/$1/domain/', '^src/shared/'],
      },
    },
    {
      name: 'application-depends-on-abstractions-only',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/application/' },
      to: {
        pathNot: [
          '^src/modules/$1/(domain|application)/',
          '^src/shared/',
          '^src/contracts/',
          '^src/platform/ports/',
          '^node_modules/zod/',
        ],
      },
    },
    {
      name: 'no-cross-module-internals',
      comment: 'Module khác chỉ được dùng public-api.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/public-api\.ts$'],
      },
    },
    {
      name: 'shared-and-contracts-are-leaf',
      severity: 'error',
      from: { path: '^src/(shared|contracts)/' },
      to: { path: '^src/(modules|platform)/' },
    },
    {
      name: 'platform-does-not-know-modules',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\.spec\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
