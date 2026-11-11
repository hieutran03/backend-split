import type {
  ConversationListFilter,
  ConversationRepository,
  ConversationThreadSource,
  ProjectAccess,
} from '@modules/conversations/application/ports';
import { Conversation } from '@modules/conversations/domain/conversation';
import { toPage, type Page, type PageRequest } from '@shared/pagination/page';

export class InMemoryConversationRepository implements ConversationRepository {
  public readonly rows = new Map<string, Conversation>();

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
      .filter(
        (c) =>
          !filter.search ||
          c.title.toLowerCase().includes(filter.search.toLowerCase()),
      )
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
