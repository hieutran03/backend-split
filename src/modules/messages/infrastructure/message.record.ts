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

/** BIGINT comes back as a string; sequences stay far below 2^53 (§6.2). */
const bigintAsNumber: ValueTransformer = {
  to: (value: number | undefined) => value,
  from: (value: string) => Number(value),
};

/**
 * `messages` table (§6). Naming conventions: see identity/infrastructure/records.ts.
 * Migrations are generated from this class.
 *
 * Not declared on purpose:
 *  - INDEX idx_messages_content_simple_fts: an expression (GIN full-text) index.
 *    The spec gives its name but not its expression, and TypeORM cannot generate
 *    expression indexes from an entity (TC-36).
 * `sender` stays INTEGER (1 = user, 2 = assistant) while the table is shared (S4, §6.3 S9).
 */
@Entity('messages')
@Index('ix_messages_prompt_history', ['conversationId', 'sequence'], {
  where: 'deleted_at IS NULL',
})
@Index('idx_message_conversation_created', ['conversationId', 'createdAt'])
@Unique('uq_messages_conversation_sequence', ['conversationId', 'sequence'])
@Check('ck_messages_sequence_positive', 'sequence > 0')
export class MessageRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'messages_pkey' })
  public id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  @ForeignKey('conversations', { name: 'messages_conversation_id_fkey' })
  public conversationId!: string;

  @Column({ type: 'integer' })
  public sender!: number;

  @Column({ type: 'text' })
  public content!: string;

  @Column({ name: 'message_metadata', type: 'jsonb', nullable: true })
  public messageMetadata!: Record<string, unknown> | null;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  public sequence!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  public deletedAt!: Date | null;
}
