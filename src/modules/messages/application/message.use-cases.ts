import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import { mapPage, type Page, type PageRequest } from '@shared/pagination/page';
import type { MessageRepository, MessageSort } from './ports';
import { toMessageView, type MessageView } from './message.view';

/** A19 — not owned, deleted or unknown ⇒ 404 message_not_found (D15; Python: 403). */
export class GetMessageUseCase {
  public constructor(private readonly messages: MessageRepository) {}

  public async execute(actor: Actor, messageId: string): Promise<MessageView> {
    const message = await this.messages.findOwned(messageId, actor.userId);
    if (!message) throw new NotFoundError('message');
    return toMessageView(message);
  }
}

/** A10 default order: `-sequence` (stable order inside one conversation). */
const CONVERSATION_DEFAULT_SORT: MessageSort = {
  field: 'sequence',
  direction: 'DESC',
};

/** A10 — messages of one of my conversations; otherwise 404 conversation_not_found. */
export class ListConversationMessagesUseCase {
  public constructor(private readonly messages: MessageRepository) {}

  public async execute(
    actor: Actor,
    conversationId: string,
    page: PageRequest,
  ): Promise<Page<MessageView>> {
    if (!(await this.messages.ownsConversation(conversationId, actor.userId))) {
      throw new NotFoundError('conversation');
    }
    const result = await this.messages.listOwned(
      actor.userId,
      { conversationId },
      page,
      CONVERSATION_DEFAULT_SORT,
    );
    return mapPage(result, toMessageView);
  }
}

/**
 * A20 default order: `-createdAt`, as in Python (sequence is only ordered inside
 * one conversation). An unknown or foreign `conversationId` filter yields an
 * empty page, like any filter that matches nothing.
 */
const MY_MESSAGES_DEFAULT_SORT: MessageSort = {
  field: 'createdAt',
  direction: 'DESC',
};

export class ListMyMessagesUseCase {
  public constructor(private readonly messages: MessageRepository) {}

  public async execute(
    actor: Actor,
    filter: { conversationId?: string | undefined },
    page: PageRequest,
  ): Promise<Page<MessageView>> {
    const result = await this.messages.listOwned(
      actor.userId,
      filter,
      page,
      MY_MESSAGES_DEFAULT_SORT,
    );
    return mapPage(result, toMessageView);
  }
}
