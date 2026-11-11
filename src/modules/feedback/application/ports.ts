import type { Feedback } from '../domain/feedback';

export interface FeedbackRepository {
  /** The live feedback of `userId` on `messageId`, if any. */
  findByMessage(messageId: string, userId: string): Promise<Feedback | null>;
  /** Throws ConflictError(feedback_exists) when the message already has one (unique message_id). */
  insert(feedback: Feedback): Promise<void>;
  save(feedback: Feedback): Promise<void>;
}
export const FEEDBACK_REPOSITORY = Symbol('FEEDBACK_REPOSITORY');

/** What this context needs from the messages context, in its own words. */
export interface MessageAccess {
  /** true when the message is visible to `userId` (A19 rules). */
  canRate(messageId: string, userId: string): Promise<boolean>;
}
export const MESSAGE_ACCESS = Symbol('MESSAGE_ACCESS');
