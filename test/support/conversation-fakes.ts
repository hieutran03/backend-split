import type {
  ConversationListFilter,
  ConversationMessages,
  ConversationMessageView,
  ConversationRepository,
  ConversationThreadSource,
  ForkFingerprint,
  ForkMessages,
  ProjectAccess,
} from '@modules/conversations/application/ports';
import { ForkRequestTakenError } from '@modules/conversations/application/ports';
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

  /** `${ownerId}:${requestId}` ⇒ child id + fingerprint (mirrors the unique index). */
  public readonly forkRequests = new Map<
    string,
    { childId: string; fingerprint: string }
  >();

  public findForkRequest(
    ownerId: string,
    requestId: string,
  ): Promise<{ child: Conversation; fingerprint: string } | null> {
    const hit = this.forkRequests.get(`${ownerId}:${requestId}`);
    const child = hit && this.rows.get(hit.childId);
    return Promise.resolve(
      hit && child
        ? {
            child: Conversation.restore(child.snapshot()),
            fingerprint: hit.fingerprint,
          }
        : null,
    );
  }

  public insertFork(
    child: Conversation,
    request: { requestId: string; fingerprint: string },
  ): Promise<void> {
    const key = `${child.snapshot().ownerId}:${request.requestId}`;
    if (this.forkRequests.has(key)) {
      return Promise.reject(new ForkRequestTakenError());
    }
    this.forkRequests.set(key, {
      childId: child.id,
      fingerprint: request.fingerprint,
    });
    return this.insert(child);
  }

  /** Test helper: soft-delete a row directly. */
  public markDeleted(id: string, at: Date): void {
    const c = this.rows.get(id);
    if (c) c.softDelete(at);
  }
}

/** Projects owned by each user: { [ownerId]: [projectId, ...] }. */
export class FakeProjectAccess implements ProjectAccess {
  public constructor(private readonly owned: Record<string, string[]> = {}) {}

  public lockOwnedActiveProject(
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

interface FakeMessage {
  readonly sequence: number;
  readonly sender: 'user' | 'assistant';
  readonly bytes: number;
}

/** Messages per conversation by id; copy records what was copied. */
export class FakeForkMessages implements ForkMessages {
  public readonly byConversation = new Map<string, Map<string, FakeMessage>>();
  public readonly copies: Array<{
    sourceId: string;
    childId: string;
    through: number;
  }> = [];

  public add(
    conversationId: string,
    messageId: string,
    sequence: number,
    sender: 'user' | 'assistant',
    bytes = 10,
  ): void {
    const list =
      this.byConversation.get(conversationId) ?? new Map<string, FakeMessage>();
    list.set(messageId, { sequence, sender, bytes });
    this.byConversation.set(conversationId, list);
  }

  public findMessage(conversationId: string, messageId: string) {
    const m = this.byConversation.get(conversationId)?.get(messageId);
    return Promise.resolve(
      m ? { sequence: m.sequence, sender: m.sender } : null,
    );
  }

  public prefixSize(conversationId: string, through: number) {
    const prefix = [
      ...(this.byConversation.get(conversationId)?.values() ?? []),
    ].filter((m) => m.sequence <= through);
    return Promise.resolve({
      count: prefix.length,
      bytes: prefix.reduce((sum, m) => sum + m.bytes, 0),
    });
  }

  public async copyPrefix(sourceId: string, childId: string, through: number) {
    this.copies.push({ sourceId, childId, through });
    return (await this.prefixSize(sourceId, through)).count;
  }
}

/** Deterministic, readable fingerprint for tests. */
export class FakeForkFingerprint implements ForkFingerprint {
  public of(input: {
    sourceConversationId: string;
    messageId: string;
    title: string | null;
  }): string {
    return `${input.sourceConversationId}|${input.messageId}|${input.title ?? ''}`;
  }
}

/** Runs work immediately; records which conversations were locked. */
export class FakeTurnLock {
  public readonly locked: string[] = [];

  public withLock<T>(conversationId: string, work: () => Promise<T>) {
    this.locked.push(conversationId);
    return work();
  }
}
