import { IsNull, QueryFailedError } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import { ConflictError } from '@shared/errors/app-error';
import { Feedback } from '../domain/feedback';
import type { FeedbackRepository } from '../application/ports';
import { FeedbackRecord } from './feedback.record';

export class TypeOrmFeedbackRepository implements FeedbackRepository {
  public constructor(private readonly db: DbContext) {}

  private get repo() {
    return this.db.manager.getRepository(FeedbackRecord);
  }

  public async findByMessage(
    messageId: string,
    userId: string,
  ): Promise<Feedback | null> {
    const r = await this.repo.findOneBy({
      messageId,
      userId,
      deletedAt: IsNull(),
    });
    return r ? toDomain(r) : null;
  }

  public async insert(feedback: Feedback): Promise<void> {
    try {
      await this.repo.insert({ ...feedback.snapshot() });
    } catch (error) {
      if (isUniqueViolation(error, 'ix_feedbacks_message_id')) {
        throw new ConflictError('Feedback already exists', 'feedback_exists');
      }
      throw error;
    }
  }

  public async save(feedback: Feedback): Promise<void> {
    const p = feedback.snapshot();
    await this.repo.update(
      { id: p.id },
      { rating: p.rating, comment: p.comment, updatedAt: p.updatedAt },
    );
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = error.driverError as { code?: string; constraint?: string };
  return driver.code === '23505' && driver.constraint === constraint;
}

function toDomain(r: FeedbackRecord): Feedback {
  return Feedback.restore({
    id: r.id,
    messageId: r.messageId,
    userId: r.userId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  });
}
