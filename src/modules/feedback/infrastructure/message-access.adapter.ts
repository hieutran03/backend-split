import type { MessageOwnership } from '@modules/messages/public-api';
import type { MessageAccess } from '../application/ports';

/** MessageAccess (this context's port) ⇒ messages context public query. */
export class MessageOwnershipAccessAdapter implements MessageAccess {
  public constructor(private readonly messages: MessageOwnership) {}

  public canRate(messageId: string, userId: string): Promise<boolean> {
    return this.messages.isVisibleTo(messageId, userId);
  }
}
