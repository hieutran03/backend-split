import { RefreshTokenRecord, UserRecord } from '@modules/identity/public-api';
import { ProjectRecord } from '@modules/projects/public-api';
import { OutboxEventRecord } from '@platform/database/outbox/outbox-event.record';
import { DevBaseline1762646400000 } from '@platform/database/migrations/1762646400000-dev-baseline';

/**
 * Tables this backend reads/writes via TypeORM — listed explicitly (no glob)
 * so the table ownership boundary (§6, 24 backend tables) is visible in review.
 *
 * Adding a new module: add its Record here + its dev migration to ALL_MIGRATIONS.
 */
export const ALL_ENTITIES = [
  // platform
  OutboxEventRecord,
  // identity
  UserRecord,
  RefreshTokenRecord,
  // projects
  ProjectRecord,
];

export const ALL_MIGRATIONS = [DevBaseline1762646400000];
