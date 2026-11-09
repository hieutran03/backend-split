import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * ⚠️ BASELINE FOR AN EMPTY LOCAL DB — DO NOT run on a DB shared with Python.
 *
 * In real environments, the schema of these tables belongs to Alembic until P3 (§6.3 S7).
 * This migration only recreates the exact column names/types/indexes (per the SQLAlchemy
 * metadata at 905e52f6) so NestJS dev can run without a real DB dump.
 *
 * Convention: each task that adds tables (CONV-01, MSG-01, ...) writes its own dev migration,
 * following §6 of the backend split document exactly. Do not use synchronize.
 *
 * Note: Python does NOT set DB defaults for id/created_at/updated_at — the app sets them.
 * TypeORM entities therefore use plain @Column and the mapper assigns timestamps.
 */
export class DevBaseline1762646400000 implements MigrationInterface {
  public readonly name = 'DevBaseline1762646400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        deleted_at timestamptz NULL,
        username varchar(50) NOT NULL,
        email varchar(255) NOT NULL,
        password_hash text NOT NULL,
        avatar_url varchar(2048) NULL,
        token_version integer NOT NULL DEFAULT 0,
        role varchar(16) NOT NULL DEFAULT 'user'
      )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id),
        token_hash varchar(128) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz NULL,
        replaced_by_id uuid NULL REFERENCES refresh_tokens(id),
        user_agent varchar(512) NULL,
        created_at timestamptz NOT NULL
      )`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        deleted_at timestamptz NULL,
        owner_id uuid NOT NULL REFERENCES users(id),
        name varchar(255) NOT NULL,
        description text NULL,
        instructions text NULL
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_projects_owner_deleted ON projects (owner_id, deleted_at)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        deleted_at timestamptz NULL,
        owner_id uuid NOT NULL REFERENCES users(id),
        title varchar(255) NOT NULL,
        persona_prompt text NULL,
        planning_mode_enabled boolean NOT NULL DEFAULT false,
        next_message_sequence bigint NOT NULL DEFAULT 1,
        plan_lifecycle varchar(20) NULL,
        project_id uuid NULL REFERENCES projects(id),
        forked_from_conversation_id uuid NULL REFERENCES conversations(id) ON DELETE SET NULL,
        forked_from_message_id uuid NULL,
        forked_through_sequence bigint NULL,
        fork_request_id uuid NULL,
        fork_request_fingerprint varchar(64) NULL,
        CONSTRAINT ck_conversations_next_message_sequence_positive CHECK (next_message_sequence > 0),
        CONSTRAINT uq_conversations_owner_fork_request UNIQUE (owner_id, fork_request_id)
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_conversations_owner_id ON conversations (owner_id)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_conversations_project_id ON conversations (project_id)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_conversations_project_updated ON conversations (project_id, updated_at) WHERE deleted_at IS NULL`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id uuid PRIMARY KEY,
        event_type varchar(64) NOT NULL,
        aggregate_type varchar(64) NOT NULL,
        aggregate_id varchar(255) NOT NULL,
        payload jsonb NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        attempt_count integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL,
        last_error text NULL,
        published_at timestamptz NULL,
        created_at timestamptz NOT NULL
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_outbox_events_status_available ON outbox_events (status, available_at)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS outbox_events`);
    await q.query(`DROP TABLE IF EXISTS conversations`);
    await q.query(`DROP TABLE IF EXISTS projects`);
    await q.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await q.query(`DROP TABLE IF EXISTS users`);
  }
}
