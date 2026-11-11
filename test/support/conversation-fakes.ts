import type {
  ConversationListFilter,
  ConversationMessages,
  ConversationMessageView,
  ConversationRepository,
  ConversationThreadSource,
  ProjectAccess,
} from '@modules/conversations/application/ports';
import { Conversation } from '@modules/conversations/domain/conversation';
import { toPage, type Page, type PageRequest } from '@shared/pagination/page';

export class InMemoryConversationRepository implements ConversationRepository {
  public readonly rows = new Map<string, Conversation>();
  /** Message contents per conversation, used by `search` (title OR content). */
  public contentsOf: (conversationId: string) => string[] = () => [];

  public findOwned(id: string, ownerId: string): Promise<Conversation | null> {
    const c = this.rows.get(id)?.snapshot();
    if (!c || c.ownerId !== ownerId || c.deletedAt)
      return Promise.resolve(null);
    return Promise.resolve(Conversation.restore(c));
  }

  public findOwnedForUpdate(
    id: string,
    ownerId: string,
  ): Promise<Conversation | null> {
    return this.findOwned(id, ownerId);
  }

  public listOwned(
    ownerId: string,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<Page<Conversation>> {
    const all = [...this.rows.values()]
      .map((c) => c.snapshot())
      .filter((c) => c.ownerId === ownerId && !c.deletedAt)
      .filter((c) => !filter.projectId || c.projectId === filter.projectId)
      .filter((c) => {
        if (!filter.search) return true;
        const needle = filter.search.toLowerCase();
        return [c.title, ...this.contentsOf(c.id)].some((text) =>
          text.toLowerCase().includes(needle),
        );
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const items = all
      .slice((page.page - 1) * page.limit, page.page * page.limit)
      .map((c) => Conversation.restore(c));
    return Promise.resolve(toPage(items, all.length, page));
  }

  public insert(conversation: Conversation): Promise<void> {
    this.rows.set(
      conversation.id,
      Conversation.restore(conversation.snapshot()),
    );
    return Promise.resolve();
  }

  public save(conversation: Conversation): Promise<void> {
    return this.insert(conversation);
  }
}

/** Projects owned by each user: { [ownerId]: [projectId, ...] }. */
export class FakeProjectAccess implements ProjectAccess {
  public constructor(private readonly owned: Record<string, string[]> = {}) {}

  public ownsActiveProject(
    ownerId: string,
    projectId: string,
  ): Promise<boolean> {
    return Promise.resolve((this.owned[ownerId] ?? []).includes(projectId));
  }
}

/** Thread ids per conversation: { [conversationId]: [threadId, ...] }. */
export class FakeThreadSource implements ConversationThreadSource {
  public constructor(private readonly threads: Record<string, string[]> = {}) {}

  public threadIdsOf(conversationId: string): Promise<string[]> {
    return Promise.resolve([...(this.threads[conversationId] ?? [])]);
  }
}

/** Live messages per conversation; returned newest first like the real digest. */
export class FakeConversationMessages implements ConversationMessages {
  public readonly byConversation = new Map<string, ConversationMessageView[]>();
  public latestCalls = 0;

  public add(
    conversationId: string,
    sequence: number,
    content: string,
    sender: 'user' | 'assistant' = 'user',
  ): void {
    const at = new Date(Date.UTC(2026, 10, 1, 0, sequence)).toISOString();
    const list = this.byConversation.get(conversationId) ?? [];
    list.push({
      id: `${conversationId}-m${sequence}`,
      conversationId,
      sender,
      content,
      messageMetadata: null,
      sequence,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    list.sort((a, b) => b.sequence - a.sequence);
    this.byConversation.set(conversationId, list);
  }

  public contentsOf = (conversationId: string): string[] =>
    (this.byConversation.get(conversationId) ?? []).map((m) => m.content);

  public countByConversation(ids: string[]): Promise<Map<string, number>> {
    return Promise.resolve(
      new Map(
        ids
          .filter((id) => this.byConversation.has(id))
          .map((id) => [id, this.byConversation.get(id)!.length]),
      ),
    );
  }

  public latestByConversation(
    ids: string[],
    perConversation: number,
  ): Promise<Map<string, ConversationMessageView[]>> {
    this.latestCalls += 1;
    return Promise.resolve(
      new Map(
        ids
          .filter((id) => this.byConversation.has(id))
          .map((id) => [
            id,
            this.byConversation.get(id)!.slice(0, perConversation),
          ]),
      ),
    );
  }
}
