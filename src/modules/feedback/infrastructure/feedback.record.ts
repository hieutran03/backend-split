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
 * ck_feedbacks_rating_range: the spec names it and says "rating 1–5" (migration
 * 371ffaf3a087); the exact SQL text of the Python constraint is not in the spec,
 * this is the equivalent range check (TC-42).
 */
@Entity('feedbacks')
@Index('ix_feedbacks_message_id', ['messageId'], { unique: true })
@Index('ix_feedbacks_user_id', ['userId'])
@Check('ck_feedbacks_rating_range', 'rating >= 1 AND rating <= 5')
export class FeedbackRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'feedbacks_pkey' })
  public id!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  @ForeignKey('messages', { name: 'feedbacks_message_id_fkey' })
  public messageId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('users', { name: 'feedbacks_user_id_fkey' })
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
