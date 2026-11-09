import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Bản ghi TypeORM của bảng `projects` — CHỈ là hình dạng bảng, không có logic.
 * Tên cột snake_case giữ nguyên để Engine (SQLAlchemy) đọc chung (§5).
 * Không dùng @CreateDateColumn: DB không có default (Alembic), app tự set.
 */
@Entity('projects')
export class ProjectRecord {
  @PrimaryColumn('uuid')
  public id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  public ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;

  @Column({ type: 'text', nullable: true })
  public description!: string | null;

  @Column({ type: 'text', nullable: true })
  public instructions!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  public deletedAt!: Date | null;
}
