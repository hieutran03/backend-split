import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';

/**
 * Schema conventions for every Record. The backend owns its OWN database (the Engine
 * has another one — docs/integration.md); its schema still mirrors the legacy Alembic
 * tables column for column and name for name, so the one-time data copy at cutover
 * (ETL-01) is 1:1 and can be checked with `db:migrate:check` against an Alembic DB:
 *   - every name (PK, FK, index, unique, check) is the one in the Alembic dump
 *     docs/reference/python-schema.sql — Alembic is not uniform (`users_pkey`,
 *     `fk_projects_owner_id_users`, `feedback_pkey` on table feedbacks, ...)
 *   - for tables NestJS adds: `<table>_pkey`, `<table>_<column>_fkey`, ix_ and uq_ prefixes
 * Migrations are GENERATED from these classes (`pnpm db:migrate:generate`), never hand-written
 *   (sole exception: AlembicOnlyDifferences, see journal 018).
 */

/** `users` table (§6). `role` is a new column (§6.3 S1, backend DB, W1). */
@Entity('users')
@Index('ix_users_email', ['email'], { unique: true })
@Index('ix_users_username', ['username'], { unique: true })
export class UserRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'users_pkey' })
  public id!: string;

  @Column({ type: 'varchar', length: 50 })
  public username!: string;

  @Column({ type: 'varchar', length: 255 })
  public email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  public passwordHash!: string;

  @Column({
    name: 'avatar_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  public avatarUrl!: string | null;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  public tokenVersion!: number;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  public role!: 'user' | 'admin';

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  public deletedAt!: Date | null;
}

/**
 * New `refresh_tokens` table (§6.3 S2): stores only the token SHA-256, single use,
 * rotated via `replaced_by_id`, revoked by chain (AUTH-02).
 */
@Entity('refresh_tokens')
@Index('uq_refresh_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('ix_refresh_tokens_user_id', ['userId'])
export class RefreshTokenRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'refresh_tokens_pkey' })
  public id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('users', { name: 'refresh_tokens_user_id_fkey' })
  public userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  public tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  public expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  public revokedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  @ForeignKey('refresh_tokens', {
    name: 'refresh_tokens_replaced_by_id_fkey',
  })
  public replacedById!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  public userAgent!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
