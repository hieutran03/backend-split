import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HAND-WRITTEN — the only exception to "migrations are generated" (TC-36).
 *
 * `migration:generate` cannot express or detect these three differences with the
 * Alembic schema (docs/reference/python-schema.sql, head c4f1a7b9d2e6):
 *  1. idx_messages_content_simple_fts — a GIN expression index (Alembic de19068933b7).
 *     The record declares it with `synchronize: false`.
 *  2. feedbacks primary key named `feedback_pkey` — Alembic renamed the table but
 *     not its constraints; TypeORM does not compare PK constraint names.
 *  3. ck_conversations_forked_through_sequence_positive — same name, Alembic text
 *     `forked_through_sequence IS NULL OR ...`; TypeORM compares CHECKs by name only.
 * Verified by diffing pg_catalog of both schemas (journal 018).
 */
export class AlembicOnlyDifferences1794969244460 implements MigrationInterface {
  name = 'AlembicOnlyDifferences1794969244460';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messages_content_simple_fts" ON "messages" USING gin (to_tsvector('simple', content))`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedbacks" RENAME CONSTRAINT "feedbacks_pkey" TO "feedback_pkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "ck_conversations_forked_through_sequence_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "ck_conversations_forked_through_sequence_positive" CHECK (forked_through_sequence IS NULL OR forked_through_sequence > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "ck_conversations_forked_through_sequence_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "ck_conversations_forked_through_sequence_positive" CHECK (forked_through_sequence > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedbacks" RENAME CONSTRAINT "feedback_pkey" TO "feedbacks_pkey"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_messages_content_simple_fts"`,
    );
  }
}
