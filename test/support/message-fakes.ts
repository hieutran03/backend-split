import {
  MESSAGE_SORTABLE,
  type MessageListFilter,
  type MessageRepository,
  type MessageSort,
} from '@modules/messages/application/ports';
import { Message, type MessageProps } from '@modules/messages/domain/message';
import {
  parseSort,
  toPage,
  type Page,
  type PageRequest,
} from '@shared/pagination/page';

interface FakeConversation {
  readonly ownerId: string;
  deleted: boolean;
}

/** Messages plus the conversation ownership they inherit (owner, deleted flag). */
export class InMemoryMessageRepository implements MessageRepository {
  public readonly conversations = new Map<string, FakeConversation>();
  public readonly rows: MessageProps[] = [];

  public addConversation(id: string, ownerId: string): void {
    this.conversations.set(id, { ownerId, deleted: false });
  }

  public deleteConversation(id: string): void {
    const c = this.conversations.get(id);
    if (c) c.deleted = true;
  }

  public add(props: MessageProps): void {
    this.rows.push(props);
  }

  private visibleTo(ownerId: string): MessageProps[] {
    return this.rows.filter((m) => {
      const c = this.conversations.get(m.conversationId);
      return !!c && !c.deleted && c.ownerId === ownerId && !m.deletedAt;
    });
  }

  public findOwned(id: string, ownerId: string): Promise<Message | null> {
    const m = this.visibleTo(ownerId).find((r) => r.id === id);
    return Promise.resolve(m ? Message.restore(m) : null);
  }

  public ownsConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<boolean> {
    const c = this.conversations.get(conversationId);
    return Promise.resolve(!!c && !c.deleted && c.ownerId === ownerId);
  }

  public listOwned(
    ownerId: string,
    filter: MessageListFilter,
    page: PageRequest,
    defaultSort: MessageSort,
  ): Promise<Page<Message>> {
    const sort = parseSort(page.sort, MESSAGE_SORTABLE, defaultSort);
    const key = (m: MessageProps): number =>
      sort.field === 'sequence' ? m.sequence : m[sort.field].getTime();
    const all = this.visibleTo(ownerId)
      .filter(
        (m) =>
          !filter.conversationId || m.conversationId === filter.conversationId,
      )
      .sort((a, b) =>
        sort.direction === 'ASC' ? key(a) - key(b) : key(b) - key(a),
      );
    const items = all
      .slice((page.page - 1) * page.limit, page.page * page.limit)
      .map((m) => Message.restore(m));
    return Promise.resolve(toPage(items, all.length, page));
  }
}
