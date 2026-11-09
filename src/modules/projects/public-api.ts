/**
 * The ONLY surface other modules may import (rule `no-cross-module-internals`).
 * Exports only types/tokens/the Nest module class — never repositories/records.
 *
 * Future example (task GEN-03): generations needs `projectInstructions` for the E1 body
 * => export a query port here, do NOT let generations read the projects table directly.
 */
export { ProjectsModule } from './projects.module';
export { ProjectRecord } from './infrastructure/project.record';
