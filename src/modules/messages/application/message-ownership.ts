import type { MessageRepository } from './ports';

/**
 * Public query for other contexts (feedback): is this message visible to the
 * user? Same rules as A19 — not deleted, in a live conversation the user owns.
 */
export interface MessageOwnership {
  isVisibleTo(messageId: string, userId: string): Promise<boolean>;
}
export const MESSAGE_OWNERSHIP = Symbol('MESSAGE_OWNERSHIP');

export class RepositoryMessageOwnership implements MessageOwnership {
  public constructor(private readonly messages: MessageRepository) {}

  public async isVisibleTo(
    messageId: string,
    userId: string,
  ): Promise<boolean> {
    return (await this.messages.findOwned(messageId, userId)) !== null;
  }
}
