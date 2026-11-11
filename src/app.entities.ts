import { ConversationRecord } from '@modules/conversations/public-api';
import { FeedbackRecord } from '@modules/feedback/public-api';
import { RefreshTokenRecord, UserRecord } from '@modules/identity/public-api';
import { MessageRecord } from '@modules/messages/public-api';
import { TaskPlanRecord } from '@modules/task-plans/public-api';
import { ProjectRecord } from '@modules/projects/public-api';
import { OutboxEventRecord } from '@platform/database/outbox/outbox-event.record';

/**
 * Tables this backend reads/writes via TypeORM — listed explicitly (no glob)
 * so the table ownership boundary (§6, 24 backend tables) is visible in review.
 *
 * Adding a new module: add its Record here, then generate a migration from the entities:
 *   pnpm db:migrate:generate <Name>   (never hand-write migration SQL)
 *   pnpm db:migrate:check             (must report no pending schema change)
 */
export const ALL_ENTITIES = [
  // platform
  OutboxEventRecord,
  // identity
  UserRecord,
  RefreshTokenRecord,
  // projects
  ProjectRecord,
  // conversations
  ConversationRecord,
  // messages
  MessageRecord,
  // feedback
  FeedbackRecord,
  // task plans
  TaskPlanRecord,
];
