import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** New table §6.3 S3 — transactional outbox (D9). */
@Entity('outbox_events')
@Index('ix_outbox_events_status_available', ['status', 'availableAt'])
export class OutboxEventRecord {
  @PrimaryColumn('uuid')
  public id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  public eventType!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64 })
  public aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 255 })
  public aggregateId!: string;

  @Column('jsonb')
  public payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  public status!: 'pending' | 'published' | 'failed';

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  public attemptCount!: number;

  @Column({ name: 'available_at', type: 'timestamptz' })
  public availableAt!: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  public lastError!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  public publishedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
