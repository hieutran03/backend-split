import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTaskPlans1794363557801 implements MigrationInterface {
    name = 'AddTaskPlans1794363557801'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped')
        `);
        await queryRunner.query(`
            CREATE TABLE "task_plans" (
                "id" uuid NOT NULL,
                "conversation_id" uuid NOT NULL,
                "task_order" integer NOT NULL,
                "description" text NOT NULL,
                "status" "public"."task_status" NOT NULL,
                "task_metadata" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "completed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_task_plan_conversation_order" UNIQUE ("conversation_id", "task_order") DEFERRABLE INITIALLY DEFERRED,
                CONSTRAINT "task_plans_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "task_plans"
            ADD CONSTRAINT "task_plans_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "task_plans" DROP CONSTRAINT "task_plans_conversation_id_fkey"
        `);
        await queryRunner.query(`
            DROP TABLE "task_plans"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."task_status"
        `);
    }

}
