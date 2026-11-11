import { ValidationError } from '@shared/errors/app-error';

/**
 * Feedback — `feedbacks` table (§6). One feedback per message (unique
 * message_id), given by the owner of the message's conversation.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export interface FeedbackProps {
  readonly id: string;
  readonly messageId: string;
  readonly userId: string;
  rating: number;
  comment: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
  readonly deletedAt: Date | null;
}

export class Feedback {
  private constructor(private readonly props: FeedbackProps) {}

  public static give(input: {
    id: string;
    messageId: string;
    userId: string;
    rating: number;
    comment?: string | null;
    now: Date;
  }): Feedback {
    return new Feedback({
      id: input.id,
      messageId: input.messageId,
      userId: input.userId,
      rating: Feedback.validRating(input.rating),
      comment: Feedback.normalizeComment(input.comment),
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
  }

  public static restore(props: FeedbackProps): Feedback {
    return new Feedback({ ...props });
  }

  /** `undefined` = leave unchanged; `comment: null` clears the comment. */
  public update(
    changes: { rating?: number; comment?: string | null },
    now: Date,
  ): void {
    if (changes.rating !== undefined) {
      this.props.rating = Feedback.validRating(changes.rating);
    }
    if (changes.comment !== undefined) {
      this.props.comment = Feedback.normalizeComment(changes.comment);
    }
    this.props.updatedAt = now;
  }

  public snapshot(): Readonly<FeedbackProps> {
    return { ...this.props };
  }

  private static validRating(rating: number): number {
    if (
      !Number.isInteger(rating) ||
      rating < RATING_MIN ||
      rating > RATING_MAX
    ) {
      throw new ValidationError([
        {
          field: 'rating',
          message: `must be an integer between ${RATING_MIN} and ${RATING_MAX}`,
        },
      ]);
    }
    return rating;
  }

  /** Blank comment is stored as null. */
  private static normalizeComment(
    comment: string | null | undefined,
  ): string | null {
    if (comment === undefined || comment === null) return null;
    return comment.trim().length === 0 ? null : comment;
  }
}
