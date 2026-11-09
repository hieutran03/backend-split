import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `users` table (§6). `role` is a new column (§6.3 S1, expanded in P1). */
@Entity('users')
export class UserRecord {
  @PrimaryColumn('uuid')
  public id!: string;

  @Column({ type: 'varchar', length: 50 })
  public username!: string;

  @Column({ type: 'varchar', length: 255 })
  public email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  public passwordHash!: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 2048, nullable: true })
  public avatarUrl!: string | null;

  @Column({ name: 'token_version', type: 'int' })
  public tokenVersion!: number;

  @Column({ type: 'varchar', length: 16 })
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
export class RefreshTokenRecord {
  @PrimaryColumn('uuid')
  public id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  public userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  public tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  public expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  public revokedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  public replacedById!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  public userAgent!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
