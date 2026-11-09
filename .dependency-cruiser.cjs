/**
 * Architecture referee (pnpm test:architecture). A trimmed-down version of the platform repo's rules.
 *
 *  1. domain/application are plain TypeScript: no npm packages (except zod in application), no node builtins.
 *  2. Dependencies point inwards: domain <- application <- infrastructure/presentation <- <module>.module.ts.
 *  3. A module never imports another module's internals - only `src/modules/<x>/public-api.ts`.
 *  4. shared/ and contracts/ know nothing about modules/ or platform/ (contracts may use zod).
 *  5. platform/ never imports modules/.
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
      comment: 'domain may only import shared/ and its own module domain.',
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
      comment: 'Other modules may only use public-api.ts.',
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
