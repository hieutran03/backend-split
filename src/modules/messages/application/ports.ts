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
