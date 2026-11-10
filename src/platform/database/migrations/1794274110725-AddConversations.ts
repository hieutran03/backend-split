import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConversations1794274110725 implements MigrationInterface {
    name = 'AddConversations1794274110725'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "conversations" (
                "id" uuid NOT NULL,
                "owner_id" uuid NOT NULL,
                "title" character varying(255) NOT NULL,
                "persona_prompt" text,
                "planning_mode_enabled" boolean NOT NULL,
                "next_message_sequence" bigint NOT NULL,
                "plan_lifecycle" character varying(20),
                "project_id" uuid,
                "forked_from_conversation_id" uuid,
                "forked_from_message_id" uuid,
                "forked_through_sequence" bigint,
                "fork_request_id" uuid,
                "fork_request_fingerprint" character varying(64),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_conversations_owner_fork_request" UNIQUE ("owner_id", "fork_request_id"),
                CONSTRAINT "ck_conversations_forked_through_sequence_positive" CHECK (forked_through_sequence > 0),
                CONSTRAINT "ck_conversations_next_message_sequence_positive" CHECK (next_message_sequence > 0),
                CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_conversations_project_updated" ON "conversations" ("project_id", "updated_at")
            WHERE deleted_at IS NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_conversations_forked_from_message_id" ON "conversations" ("forked_from_message_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_conversations_forked_from_conversation_id" ON "conversations" ("forked_from_conversation_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_conversations_project_id" ON "conversations" ("project_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_conversations_owner_id" ON "conversations" ("owner_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_forked_from_conversation_id_fkey" FOREIGN KEY ("forked_from_conversation_id") REFERENCES "conversations"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_forked_from_conversation_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_project_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_owner_id_fkey"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_conversations_owner_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_conversations_project_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_conversations_forked_from_conversation_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_conversations_forked_from_message_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_conversations_project_updated"
        `);
        await queryRunner.query(`
            DROP TABLE "conversations"
        `);
    }

}
