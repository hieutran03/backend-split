import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794273815758 implements MigrationInterface {
    name = 'InitialSchema1794273815758'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "outbox_events" (
                "id" uuid NOT NULL,
                "event_type" character varying(64) NOT NULL,
                "aggregate_type" character varying(64) NOT NULL,
                "aggregate_id" character varying(255) NOT NULL,
                "payload" jsonb NOT NULL,
                "status" character varying(16) NOT NULL DEFAULT 'pending',
                "attempt_count" integer NOT NULL DEFAULT '0',
                "available_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "last_error" text,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_outbox_events_status_available" ON "outbox_events" ("status", "available_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL,
                "username" character varying(50) NOT NULL,
                "email" character varying(255) NOT NULL,
                "password_hash" text NOT NULL,
                "avatar_url" character varying(2048),
                "token_version" integer NOT NULL DEFAULT '0',
                "role" character varying(16) NOT NULL DEFAULT 'user',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "users_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "ix_users_username" ON "users" ("username")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "ix_users_email" ON "users" ("email")
        `);
        await queryRunner.query(`
            CREATE TABLE "refresh_tokens" (
                "id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "token_hash" character varying(128) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "replaced_by_id" uuid,
                "user_agent" character varying(512),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")
        `);
        await queryRunner.query(`
            CREATE TABLE "projects" (
                "id" uuid NOT NULL,
                "owner_id" uuid NOT NULL,
                "name" character varying(255) NOT NULL,
                "description" text,
                "instructions" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_projects_owner_deleted" ON "projects" ("owner_id", "deleted_at")
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "projects" DROP CONSTRAINT "projects_owner_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_replaced_by_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_fkey"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_projects_owner_deleted"
        `);
        await queryRunner.query(`
            DROP TABLE "projects"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."uq_refresh_tokens_token_hash"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_refresh_tokens_user_id"
        `);
        await queryRunner.query(`
            DROP TABLE "refresh_tokens"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_users_email"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_users_username"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_events_status_available"
        `);
        await queryRunner.query(`
            DROP TABLE "outbox_events"
        `);
    }

}
