/**
 * Bề mặt DUY NHẤT module khác được import (rule `no-cross-module-internals`).
 * Chỉ export type/token/class Nest module — không export repository/record.
 *
 * Ví dụ sau này (task GEN-03): generations cần `projectInstructions` cho body E1
 * => export một query port ở đây, KHÔNG để generations đọc bảng projects trực tiếp.
 */
export { ProjectsModule } from './projects.module';
export { ProjectRecord } from './infrastructure/project.record';
