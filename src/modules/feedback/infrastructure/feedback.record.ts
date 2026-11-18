import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * `feedbacks` table (§6). Naming conventions: see identity/infrastructure/records.ts.
 * Migrations are generated from this class.
 *
 * ck_feedbacks_rating_range: Python declares `rating BETWEEN 1 AND 5`; Postgres stores
 * it as `rating >= 1 AND rating <= 5`, which is what is declared here (TC-42).
 * PK/FK names keep the pre-rename `feedback_*` names: Alembic renamed the table
 * (ef1b2c3d4e5f) but not its constraints (docs/reference/python-schema.sql).
 */
@Entity('feedbacks')
@Index('ix_feedbacks_message_id', ['messageId'], { unique: true })
@Index('ix_feedbacks_user_id', ['userId'])
@Check('ck_feedbacks_rating_range', 'rating >= 1 AND rating <= 5')
export class FeedbackRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'feedback_pkey' })
  public id!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  @ForeignKey('messages', { name: 'feedback_message_id_fkey' })
  public messageId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('users', { name: 'feedback_user_id_fkey' })
  public userId!: string;

  @Column({ type: 'smallint' })
  public rating!: number;

  @Column({ type: 'text', nullable: true })
  public comment!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  public deletedAt!: Date | null;
}
