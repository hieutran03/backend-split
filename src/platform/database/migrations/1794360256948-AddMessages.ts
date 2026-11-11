import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessages1794360256948 implements MigrationInterface {
    name = 'AddMessages1794360256948'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "messages" (
                "id" uuid NOT NULL,
                "conversation_id" uuid NOT NULL,
                "sender" integer NOT NULL,
                "content" text NOT NULL,
                "message_metadata" jsonb,
                "sequence" bigint NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_messages_conversation_sequence" UNIQUE ("conversation_id", "sequence"),
                CONSTRAINT "ck_messages_sequence_positive" CHECK (sequence > 0),
                CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_message_conversation_created" ON "messages" ("conversation_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_messages_prompt_history" ON "messages" ("conversation_id", "sequence")
            WHERE deleted_at IS NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_forked_from_message_id_fkey" FOREIGN KEY ("forked_from_message_id") REFERENCES "messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "messages"
            ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_forked_from_message_id_fkey"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_messages_prompt_history"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_message_conversation_created"
        `);
        await queryRunner.query(`
            DROP TABLE "messages"
        `);
    }

}
