import type { Actor } from '@shared/auth/actor';
import { ConflictError, NotFoundError } from '@shared/errors/app-error';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import { Feedback } from '../domain/feedback';
import type { FeedbackRepository, MessageAccess } from './ports';

export interface FeedbackView {
  readonly id: string;
  readonly messageId: string;
  readonly userId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Field names follow Python `FeedbackRead`. */
export function toFeedbackView(f: Feedback): FeedbackView {
  const p = f.snapshot();
  return {
    id: p.id,
    messageId: p.messageId,
    userId: p.userId,
    rating: p.rating,
    comment: p.comment,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}

/** Security fix (A30/A33/A34): the caller must be able to see the message, else 404. */
async function assertMessageVisible(
  messages: MessageAccess,
  messageId: string,
  actor: Actor,
): Promise<void> {
  if (!(await messages.canRate(messageId, actor.userId))) {
    throw new NotFoundError('message');
  }
}

/**
 * A30 — create only. An existing feedback ⇒ 409 feedback_exists (use PATCH);
 * Python upserted. The pre-check gives the common case a clean answer; the unique
 * index on message_id settles concurrent creates (the repository maps it to 409).
 */
export class CreateFeedbackUseCase {
  public constructor(
    private readonly feedbacks: FeedbackRepository,
    private readonly messages: MessageAccess,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(
    actor: Actor,
    messageId: string,
    input: { rating: number; comment?: string | null | undefined },
  ): Promise<FeedbackView> {
    await assertMessageVisible(this.messages, messageId, actor);
    if (await this.feedbacks.findByMessage(messageId, actor.userId)) {
      throw new ConflictError('Feedback already exists', 'feedback_exists');
    }
    const feedback = Feedback.give({
      id: this.ids.uuid(),
      messageId,
      userId: actor.userId,
      rating: input.rating,
      comment: input.comment,
      now: this.clock.now(),
    });
    await this.feedbacks.insert(feedback);
    return toFeedbackView(feedback);
  }
}

/** A32/A33 — my feedback on the message, or 404 feedback_not_found (Python: data null). */
export class GetFeedbackUseCase {
  public constructor(
    private readonly feedbacks: FeedbackRepository,
    private readonly messages: MessageAccess,
  ) {}

  public async execute(actor: Actor, messageId: string): Promise<FeedbackView> {
    await assertMessageVisible(this.messages, messageId, actor);
    const feedback = await this.feedbacks.findByMessage(
      messageId,
      actor.userId,
    );
    if (!feedback) throw new NotFoundError('feedback');
    return toFeedbackView(feedback);
  }
}

/** A34 — addressed by message (1:1). `comment: null` clears the comment. */
export class UpdateFeedbackUseCase {
  public constructor(
    private readonly feedbacks: FeedbackRepository,
    private readonly messages: MessageAccess,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Actor,
    messageId: string,
    input: { rating?: number | undefined; comment?: string | null | undefined },
  ): Promise<FeedbackView> {
    await assertMessageVisible(this.messages, messageId, actor);
    const feedback = await this.feedbacks.findByMessage(
      messageId,
      actor.userId,
    );
    if (!feedback) throw new NotFoundError('feedback');
    feedback.update(input, this.clock.now());
    await this.feedbacks.save(feedback);
    return toFeedbackView(feedback);
  }
}
