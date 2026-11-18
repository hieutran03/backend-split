import type { MessageView } from './message.view';

/**
 * Public query for other contexts (exported through public-api.ts): message
 * counts and the latest messages of several conversations at once, for the
 * conversation list (A9 include=messages).
 *
 * No ownership check here: callers pass conversation ids they have already
 * authorized (the conversations context lists only the caller's conversations).
 * Deleted messages are never counted nor returned.
 */
export interface ConversationMessageDigest {
  /** Missing key ⇒ 0 messages. */
  countByConversation(conversationIds: string[]): Promise<Map<string, number>>;
  /**
   * The `perConversation` most recent messages of each conversation, returned
   * oldest first like Python (TC-41). Missing key ⇒ no messages.
   */
  latestByConversation(
    conversationIds: string[],
    perConversation: number,
  ): Promise<Map<string, MessageView[]>>;
}
export const CONVERSATION_MESSAGE_DIGEST = Symbol(
  'CONVERSATION_MESSAGE_DIGEST',
);
