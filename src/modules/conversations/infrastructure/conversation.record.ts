import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
  type ValueTransformer,
} from 'typeorm';

import type { PlanLifecycle } from '../domain/conversation';

/**
 * Postgres returns BIGINT as a string. Sequences stay far below 2^53, so they are
 * mapped to number (§6.2: "transformer parseInt nếu chắc chắn < 2^53").
 */
const bigintAsNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * `conversations` table (§6, metadata of 905e52f6). Naming conventions: see
 * identity/infrastructure/records.ts. Migrations are generated from this class.
 *
 * Not declared on purpose:
 *  - CHECK ck_conversations_fork_request_fields_together: the spec only gives its
 *    name, not its expression (TC-29) — not guessed.
 * No DB defaults on next_message_sequence / planning_mode_enabled: like the Python
 * models, the application sets them (§11 "Default phía Python").
 */
@Entity('conversations')
@Index('ix_conversations_owner_id', ['ownerId'])
@Index('ix_conversations_project_id', ['projectId'])
@Index('ix_conversations_forked_from_conversation_id', [
  'forkedFromConversationId',
])
@Index('ix_conversations_forked_from_message_id', ['forkedFromMessageId'])
@Index('ix_conversations_project_updated', ['projectId', 'updatedAt'], {
  where: 'deleted_at IS NULL',
})
@Unique('uq_conversations_owner_fork_request', ['ownerId', 'forkRequestId'])
@Check(
  'ck_conversations_next_message_sequence_positive',
  'next_message_sequence > 0',
)
@Check(
  'ck_conversations_forked_through_sequence_positive',
  'forked_through_sequence > 0',
)
export class ConversationRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'conversations_pkey' })
  public id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  @ForeignKey('users', { name: 'conversations_owner_id_fkey' })
  public ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  public title!: string;

  @Column({ name: 'persona_prompt', type: 'text', nullable: true })
  public personaPrompt!: string | null;

  @Column({ name: 'planning_mode_enabled', type: 'boolean' })
  public planningModeEnabled!: boolean;

  @Column({
    name: 'next_message_sequence',
    type: 'bigint',
    transformer: bigintAsNumber,
  })
  public nextMessageSequence!: number;

  @Column({
    name: 'plan_lifecycle',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  public planLifecycle!: PlanLifecycle | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  @ForeignKey('projects', { name: 'conversations_project_id_fkey' })
  public projectId!: string | null;

  @Column({ name: 'forked_from_conversation_id', type: 'uuid', nullable: true })
  @ForeignKey('conversations', {
    name: 'conversations_forked_from_conversation_id_fkey',
    onDelete: 'SET NULL',
  })
  public forkedFromConversationId!: string | null;

  @Column({ name: 'forked_from_message_id', type: 'uuid', nullable: true })
  @ForeignKey('messages', {
    name: 'conversations_forked_from_message_id_fkey',
    onDelete: 'SET NULL',
  })
  public forkedFromMessageId!: string | null;

  @Column({
    name: 'forked_through_sequence',
    type: 'bigint',
    nullable: true,
    transformer: bigintAsNumber,
  })
  public forkedThroughSequence!: number | null;

  @Column({ name: 'fork_request_id', type: 'uuid', nullable: true })
  public forkRequestId!: string | null;

  @Column({
    name: 'fork_request_fingerprint',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  public forkRequestFingerprint!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  public deletedAt!: Date | null;
}
