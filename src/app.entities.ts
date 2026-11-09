import { ProjectRecord } from '@modules/projects/public-api';
import { OutboxEventRecord } from '@platform/database/outbox/outbox-event.record';
import { DevBaseline1762646400000 } from '@platform/database/migrations/1762646400000-dev-baseline';

/**
 * Danh sách bảng backend này đọc/ghi qua TypeORM — liệt kê tường minh (không glob)
 * để ranh giới sở hữu bảng (§6, 24 bảng backend) nhìn thấy được khi review.
 *
 * Thêm module mới: thêm Record vào đây + migration dev vào ALL_MIGRATIONS.
 */
export const ALL_ENTITIES = [
  // platform
  OutboxEventRecord,
  // projects
  ProjectRecord,
];

export const ALL_MIGRATIONS = [DevBaseline1762646400000];
