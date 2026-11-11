import { InMemoryMessageRepository } from '@test-support/message-fakes';
import { NotFoundError } from '@shared/errors/app-error';
import type { MessageSender } from '../domain/message';
import {
  GetMessageUseCase,
  ListConversationMessagesUseCase,
  ListMyMessagesUseCase,
} from './message.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };
const PAGE = { page: 1, limit: 20 };

function setup() {
  const repo = new InMemoryMessageRepository();
  repo.addConversation('c-alice', 'alice');
  repo.addConversation('c-alice-2', 'alice');
  repo.addConversation('c-bob', 'bob');
  let n = 0;
  const add = (
    conversationId: string,
    sequence: number,
    sender: MessageSender,
    deletedAt: Date | null = null,
  ): string => {
    n += 1;
    const id = `m-${n}`;
    const at = new Date(Date.UTC(2026, 10, 1, 0, n));
    repo.add({
      id,
      conversationId,
      sender,
      content: `message ${n}`,
      metadata: null,
      sequence,
      createdAt: at,
      updatedAt: at,
      deletedAt,
    });
    return id;
  };
  return {
    repo,
    add,
    get: new GetMessageUseCase(repo),
    listInConversation: new ListConversationMessagesUseCase(repo),
    listMine: new ListMyMessagesUseCase(repo),
  };
}

describe('message use cases', () => {
  it('A19: returns my message with sender as a string', async () => {
    const s = setup();
    const id = s.add('c-alice', 1, 'assistant');
    await expect(s.get.execute(alice, id)).resolves.toMatchObject({
      id,
      conversationId: 'c-alice',
      sender: 'assistant',
      sequence: 1,
      deletedAt: null,
    });
  });

  it('A19: someone else’s, deleted, or in a deleted conversation ⇒ 404 message_not_found', async () => {
    const s = setup();
    const bobs = s.add('c-bob', 1, 'user');
    const deleted = s.add('c-alice', 1, 'user', new Date());
    const inDeletedConversation = s.add('c-alice-2', 1, 'user');
    s.repo.deleteConversation('c-alice-2');

    for (const id of [bobs, deleted, inDeletedConversation]) {
      const error = await s.get.execute(alice, id).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).reason).toBe('message_not_found');
    }
  });

  it('A10: default order is -sequence; sort=sequence reverses it', async () => {
    const s = setup();
    s.add('c-alice', 1, 'user');
    s.add('c-alice', 2, 'assistant');
    s.add('c-alice', 3, 'user');
    s.add('c-alice-2', 1, 'user');

    const page = await s.listInConversation.execute(alice, 'c-alice', PAGE);
    expect(page.items.map((m) => m.sequence)).toEqual([3, 2, 1]);
    expect(page.meta.total).toBe(3);

    const asc = await s.listInConversation.execute(alice, 'c-alice', {
      ...PAGE,
      sort: 'sequence',
    });
    expect(asc.items.map((m) => m.sequence)).toEqual([1, 2, 3]);
  });

  it('A10: someone else’s or a deleted conversation ⇒ 404 conversation_not_found', async () => {
    const s = setup();
    s.add('c-alice', 1, 'user');
    s.repo.deleteConversation('c-alice-2');
    for (const [actor, conversationId] of [
      [bob, 'c-alice'],
      [alice, 'c-alice-2'],
    ] as const) {
      const error = await s.listInConversation
        .execute(actor, conversationId, PAGE)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).reason).toBe('conversation_not_found');
    }
  });

  it('A20: only my messages, newest first, optional conversation filter', async () => {
    const s = setup();
    const first = s.add('c-alice', 1, 'user');
    const second = s.add('c-alice-2', 1, 'user');
    s.add('c-bob', 1, 'user');

    const all = await s.listMine.execute(alice, {}, PAGE);
    expect(all.items.map((m) => m.id)).toEqual([second, first]);

    const filtered = await s.listMine.execute(
      alice,
      { conversationId: 'c-alice' },
      PAGE,
    );
    expect(filtered.items.map((m) => m.id)).toEqual([first]);

    const foreign = await s.listMine.execute(
      alice,
      { conversationId: 'c-bob' },
      PAGE,
    );
    expect(foreign.meta.total).toBe(0);
  });

  it('include=feedback: my feedback per message, null when none; absent without include', async () => {
    const s = setup();
    const rated = s.add('c-alice', 1, 'assistant');
    s.add('c-alice', 2, 'assistant');
    s.repo.feedback.set(`${rated}:alice`, {
      id: 'f-1',
      messageId: rated,
      userId: 'alice',
      rating: 5,
      comment: null,
      createdAt: '2026-11-11T00:00:00.000Z',
      updatedAt: '2026-11-11T00:00:00.000Z',
      deletedAt: null,
    });

    const page = await s.listInConversation.execute(
      alice,
      'c-alice',
      PAGE,
      true,
    );
    expect(page.items.map((m) => m.feedback?.rating ?? null)).toEqual([
      null,
      5,
    ]);

    const plain = await s.listMine.execute(alice, {}, PAGE);
    expect(plain.items[0]).not.toHaveProperty('feedback');
  });
});
