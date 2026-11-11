import type { Page, PageRequest } from '@shared/pagination/page';
import type { Message } from '../domain/message';

/**
 * A message belongs to the owner of its conversation. Every query hides deleted
 * messages and messages of deleted or not-owned conversations (D15: 404).
 */
export interface MessageRepository {
  findOwned(id: string, ownerId: string): Promise<Message | null>;
  /** true when the conversation exists, is not deleted and belongs to `ownerId`. */
  ownsConversation(conversationId: string, ownerId: string): Promise<boolean>;
  listOwned(
    ownerId: string,
    filter: MessageListFilter,
    page: PageRequest,
    defaultSort: MessageSort,
  ): Promise<Page<Message>>;
  /**
   * include=feedback: the live feedback `userId` gave on each message (reads the
   * `feedbacks` table by name, like `conversations` — TC-35). Missing key ⇒ none.
   */
  feedbackFor(
    messageIds: string[],
    userId: string,
  ): Promise<Map<string, MessageFeedbackView>>;
}

/** Same fields as the feedback context's FeedbackView (Python FeedbackRead). */
export interface MessageFeedbackView {
  readonly id: string;
  readonly messageId: string;
  readonly userId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');

export interface MessageListFilter {
  readonly conversationId?: string | undefined;
}

export const MESSAGE_SORTABLE = ['sequence', 'createdAt', 'updatedAt'] as const;
export type MessageSortField = (typeof MESSAGE_SORTABLE)[number];
export interface MessageSort {
  readonly field: MessageSortField;
  readonly direction: 'ASC' | 'DESC';
}
