import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';

/**
 * TypeORM record for the `projects` table — ONLY the table shape, no logic.
 * snake_case column names are kept so the Engine (SQLAlchemy) can share them (§5).
 * No @CreateDateColumn: the DB has no default (Alembic), the app sets it.
 * Naming conventions: see identity/infrastructure/records.ts.
 */
@Entity('projects')
@Index('ix_projects_owner_deleted', ['ownerId', 'deletedAt'])
export class ProjectRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'projects_pkey' })
  public id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  // Referenced by table name: projects must not import the identity module's internals.
  @ForeignKey('users', { name: 'projects_owner_id_fkey' })
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
