import type { ConversationMessageDigest } from '@modules/messages/public-api';
import type {
  ConversationMessages,
  ConversationMessageView,
} from '../application/ports';

/** ConversationMessages (this context's port) ⇒ messages context public query. */
export class MessageDigestAdapter implements ConversationMessages {
  public constructor(private readonly digest: ConversationMessageDigest) {}

  public countByConversation(
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    return this.digest.countByConversation(conversationIds);
  }

  public latestByConversation(
    conversationIds: string[],
    perConversation: number,
  ): Promise<Map<string, ConversationMessageView[]>> {
    return this.digest.latestByConversation(conversationIds, perConversation);
  }
}
