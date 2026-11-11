import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';

import { TASK_STATUSES, type TaskStatus } from '../domain/task-plan';

/**
 * `task_plans` table (§6). Naming conventions: see identity/infrastructure/records.ts.
 * Migrations are generated from this class.
 *
 * uq_task_plan_conversation_order is DEFERRABLE INITIALLY DEFERRED (§5 "Index /
 * constraint đặc biệt") so tasks can be reordered inside one transaction.
 * `status` uses the Postgres enum type `task_status`.
 */
@Entity('task_plans')
@Unique('uq_task_plan_conversation_order', ['conversationId', 'taskOrder'], {
  deferrable: 'INITIALLY DEFERRED',
})
export class TaskPlanRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'task_plans_pkey' })
  public id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  @ForeignKey('conversations', { name: 'task_plans_conversation_id_fkey' })
  public conversationId!: string;

  @Column({ name: 'task_order', type: 'integer' })
  public taskOrder!: number;

  @Column({ type: 'text' })
  public description!: string;

  @Column({ type: 'enum', enum: TASK_STATUSES, enumName: 'task_status' })
  public status!: TaskStatus;

  @Column({ name: 'task_metadata', type: 'jsonb', nullable: true })
  public taskMetadata!: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  public completedAt!: Date | null;
}
