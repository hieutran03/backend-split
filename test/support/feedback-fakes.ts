import type {
  FeedbackRepository,
  MessageAccess,
} from '@modules/feedback/application/ports';
import { Feedback } from '@modules/feedback/domain/feedback';
import { ConflictError } from '@shared/errors/app-error';

/** Mirrors the unique index on message_id: a second insert ⇒ 409 feedback_exists. */
export class InMemoryFeedbackRepository implements FeedbackRepository {
  public readonly rows = new Map<string, Feedback>();

  public findByMessage(
    messageId: string,
    userId: string,
  ): Promise<Feedback | null> {
    const f = [...this.rows.values()]
      .map((r) => r.snapshot())
      .find(
        (r) => r.messageId === messageId && r.userId === userId && !r.deletedAt,
      );
    return Promise.resolve(f ? Feedback.restore(f) : null);
  }

  public insert(feedback: Feedback): Promise<void> {
    const p = feedback.snapshot();
    if (
      [...this.rows.values()].some(
        (r) => r.snapshot().messageId === p.messageId,
      )
    ) {
      return Promise.reject(
        new ConflictError('Feedback already exists', 'feedback_exists'),
      );
    }
    this.rows.set(p.id, Feedback.restore(p));
    return Promise.resolve();
  }

  public save(feedback: Feedback): Promise<void> {
    const p = feedback.snapshot();
    this.rows.set(p.id, Feedback.restore(p));
    return Promise.resolve();
  }
}

/** Messages each user can see: { [userId]: [messageId, ...] }. */
export class FakeMessageAccess implements MessageAccess {
  public constructor(private readonly visible: Record<string, string[]> = {}) {}

  public canRate(messageId: string, userId: string): Promise<boolean> {
    return Promise.resolve((this.visible[userId] ?? []).includes(messageId));
  }
}
