import { MigrationInterface, QueryRunner } from "typeorm";

export class AlignWithAlembicSchema1794969244459 implements MigrationInterface {
    name = 'AlignWithAlembicSchema1794969244459'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "projects" DROP CONSTRAINT "projects_owner_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_project_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_forked_from_conversation_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "conversations_forked_from_message_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks" DROP CONSTRAINT "feedbacks_message_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks" DROP CONSTRAINT "feedbacks_user_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans" DROP CONSTRAINT "task_plans_conversation_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ALTER COLUMN "created_at"
            SET DEFAULT now()
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ALTER COLUMN "updated_at"
            SET DEFAULT now()
        `);
        await queryRunner.query(`
            ALTER TABLE "messages"
            ALTER COLUMN "message_metadata"
            SET DEFAULT '{}'
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ALTER COLUMN "planning_mode_enabled"
            SET DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ALTER COLUMN "next_message_sequence"
            SET DEFAULT '1'
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ALTER COLUMN "task_metadata"
            SET DEFAULT '{}'
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ALTER COLUMN "created_at"
            SET DEFAULT now()
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ALTER COLUMN "updated_at"
            SET DEFAULT now()
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "ck_conversations_fork_request_fields_together" CHECK (
                    (fork_request_id IS NULL) = (fork_request_fingerprint IS NULL)
                )
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ADD CONSTRAINT "fk_projects_owner_id_users" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "fk_conversations_project_id_projects" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "fk_conversations_forked_from_conversation_id" FOREIGN KEY ("forked_from_conversation_id") REFERENCES "conversations"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "fk_conversations_forked_from_message_id" FOREIGN KEY ("forked_from_message_id") REFERENCES "messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks"
            ADD CONSTRAINT "feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks"
            ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ADD CONSTRAINT "fk_task_plans_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "task_plans" DROP CONSTRAINT "fk_task_plans_conversation_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks" DROP CONSTRAINT "feedback_user_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks" DROP CONSTRAINT "feedback_message_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_forked_from_message_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_forked_from_conversation_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_project_id_projects"
        `);
        await queryRunner.query(`
            ALTER TABLE "projects" DROP CONSTRAINT "fk_projects_owner_id_users"
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations" DROP CONSTRAINT "ck_conversations_fork_request_fields_together"
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ALTER COLUMN "updated_at" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ALTER COLUMN "created_at" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ALTER COLUMN "task_metadata" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ALTER COLUMN "next_message_sequence" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ALTER COLUMN "planning_mode_enabled" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "messages"
            ALTER COLUMN "message_metadata" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ALTER COLUMN "updated_at" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ALTER COLUMN "created_at" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ADD CONSTRAINT "task_plans_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks"
            ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks"
            ADD CONSTRAINT "feedbacks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_forked_from_message_id_fkey" FOREIGN KEY ("forked_from_message_id") REFERENCES "messages"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_forked_from_conversation_id_fkey" FOREIGN KEY ("forked_from_conversation_id") REFERENCES "conversations"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "projects"
            ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

}
