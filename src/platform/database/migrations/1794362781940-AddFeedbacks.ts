import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbacks1794362781940 implements MigrationInterface {
    name = 'AddFeedbacks1794362781940'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "feedbacks" (
                "id" uuid NOT NULL,
                "message_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "rating" smallint NOT NULL,
                "comment" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "ck_feedbacks_rating_range" CHECK (
                    rating >= 1
                    AND rating <= 5
                ),
                CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "ix_feedbacks_user_id" ON "feedbacks" ("user_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "ix_feedbacks_message_id" ON "feedbacks" ("message_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks"
            ADD CONSTRAINT "feedbacks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks"
            ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "feedbacks" DROP CONSTRAINT "feedbacks_user_id_fkey"
        `);
        await queryRunner.query(`
            ALTER TABLE "feedbacks" DROP CONSTRAINT "feedbacks_message_id_fkey"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_feedbacks_message_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."ix_feedbacks_user_id"
        `);
        await queryRunner.query(`
            DROP TABLE "feedbacks"
        `);
    }

}
