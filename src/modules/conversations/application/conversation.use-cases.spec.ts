import {
  FixedClock,
  ImmediateTransactions,
  RecordingOutbox,
  SequentialIds,
} from '@test-support/fakes';
import {
  FakeConversationMessages,
  FakeProjectAccess,
  FakeThreadSource,
  InMemoryConversationRepository,
} from '@test-support/conversation-fakes';
import { NotFoundError, ValidationError } from '@shared/errors/app-error';
import {
  CreateConversationUseCase,
  DeleteConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  UpdateConversationUseCase,
} from './conversation.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };
/** First id handed out by SequentialIds. */
const FIRST_ID = '00000000-0000-4000-8000-000000000001';

function setup(threads: Record<string, string[]> = {}) {
  const repo = new InMemoryConversationRepository();
  const clock = new FixedClock();
  const outbox = new RecordingOutbox();
  const tx = new ImmediateTransactions();
  const messages = new FakeConversationMessages();
  repo.contentsOf = messages.contentsOf;
  const projects = new FakeProjectAccess({
    alice: ['p-alice'],
    bob: ['p-bob'],
  });
  return {
    repo,
    clock,
    outbox,
    tx,
    messages,
    create: new CreateConversationUseCase(
      repo,
      projects,
      tx,
      clock,
      new SequentialIds(),
    ),
    list: new ListConversationsUseCase(repo, messages),
    get: new GetConversationUseCase(repo),
    update: new UpdateConversationUseCase(repo, clock),
    remove: new DeleteConversationUseCase(
      repo,
      new FakeThreadSource(threads),
      outbox,
      tx,
      clock,
    ),
  };
}

describe('conversation use cases', () => {
  it('A7: creates with defaults (planning off, sequence 1, no fork data)', async () => {
    const s = setup();
    const view = await s.create.execute(alice, { title: '  Q3 planning  ' });
    expect(view).toMatchObject({
      ownerId: 'alice',
      title: 'Q3 planning',
      personaPrompt: null,
      planningModeEnabled: false,
      planLifecycle: null,
      projectId: null,
      forkedFromConversationId: null,
      deletedAt: null,
    });
    expect(s.repo.rows.get(view.id)?.snapshot().nextMessageSequence).toBe(1);
  });

  it('A7: projectId must be one of my own projects, else 404 project_not_found', async () => {
    const s = setup();
    await expect(
      s.create.execute(alice, { title: 'mine', projectId: 'p-alice' }),
    ).resolves.toHaveProperty('projectId', 'p-alice');

    const error = await s.create
      .execute(alice, { title: 'theirs', projectId: 'p-bob' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).reason).toBe('project_not_found');
    expect(s.repo.rows.size).toBe(1);
  });

  it('A7: blank persona is stored as null', async () => {
    const s = setup();
    const view = await s.create.execute(alice, {
      title: 't',
      personaPrompt: '   ',
    });
    expect(view.personaPrompt).toBeNull();
  });

  it('A8/A11: another user’s conversation ⇒ 404 conversation_not_found', async () => {
    const s = setup();
    const view = await s.create.execute(alice, { title: 'private' });
    for (const call of [
      () => s.get.execute(bob, view.id),
      () => s.update.execute(bob, view.id, { title: 'hacked' }),
    ]) {
      const error = await call().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).reason).toBe('conversation_not_found');
    }
  });

  it('A11: personaPrompt null clears it; untouched fields stay; updatedAt moves', async () => {
    const s = setup();
    const created = await s.create.execute(alice, {
      title: 'Old',
      personaPrompt: 'You are a pirate',
      planningModeEnabled: true,
    });
    s.clock.advance(1000);
    const updated = await s.update.execute(alice, created.id, {
      personaPrompt: null,
    });
    expect(updated.personaPrompt).toBeNull();
    expect(updated.title).toBe('Old');
    expect(updated.planningModeEnabled).toBe(true);
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('A11: a blank title is rejected by the domain (400)', async () => {
    const s = setup();
    const created = await s.create.execute(alice, { title: 'ok' });
    await expect(
      s.update.execute(alice, created.id, { title: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('A9: lists only my conversations, filters by project and title search', async () => {
    const s = setup();
    await s.create.execute(alice, {
      title: 'Budget review',
      projectId: 'p-alice',
    });
    await s.create.execute(alice, { title: 'Holiday plans' });
    await s.create.execute(bob, { title: 'Budget (bob)' });

    const all = await s.list.execute(alice, {}, { page: 1, limit: 20 });
    expect(all.meta.total).toBe(2);

    const byProject = await s.list.execute(
      alice,
      { projectId: 'p-alice' },
      { page: 1, limit: 20 },
    );
    expect(byProject.items.map((c) => c.title)).toEqual(['Budget review']);

    const bySearch = await s.list.execute(
      alice,
      { search: 'budget' },
      { page: 1, limit: 20 },
    );
    expect(bySearch.items.map((c) => c.title)).toEqual(['Budget review']);
  });

  it('A12: soft delete + conversation.deleted outbox (with threadIds) in 1 transaction', async () => {
    const s = setup({ [FIRST_ID]: ['thread-a', 'thread-b'] });
    const created = await s.create.execute(alice, { title: 'Gone' });
    expect(created.id).toBe(FIRST_ID);
    s.clock.advance(1000);
    const runsBefore = s.tx.runs;

    await s.remove.execute(alice, created.id);

    expect(s.tx.runs - runsBefore).toBe(1);
    expect(s.outbox.events).toEqual([
      {
        eventType: 'conversation.deleted',
        aggregateType: 'conversation',
        aggregateId: created.id,
        payload: {
          conversationId: created.id,
          ownerId: 'alice',
          threadIds: ['thread-a', 'thread-b'],
        },
      },
    ]);
    const row = s.repo.rows.get(created.id)?.snapshot();
    expect(row?.deletedAt).toEqual(s.clock.now());
    await expect(s.get.execute(alice, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const list = await s.list.execute(alice, {}, { page: 1, limit: 20 });
    expect(list.meta.total).toBe(0);
  });

  it('A12: deleting someone else’s or an already deleted conversation ⇒ 404, no event', async () => {
    const s = setup();
    const created = await s.create.execute(alice, { title: 'Mine' });

    const byBob = await s.remove
      .execute(bob, created.id)
      .catch((e: unknown) => e);
    expect(byBob).toBeInstanceOf(NotFoundError);
    expect((byBob as NotFoundError).reason).toBe('conversation_not_found');
    expect(s.repo.rows.get(created.id)?.snapshot().deletedAt).toBeNull();

    await s.remove.execute(alice, created.id);
    await expect(s.remove.execute(alice, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(s.outbox.events).toHaveLength(1);
  });

  it('A9: messageCount on every item; messages only with include=messages, newest first, capped', async () => {
    const s = setup();
    const busy = await s.create.execute(alice, { title: 'Busy' });
    const empty = await s.create.execute(alice, { title: 'Empty' });
    for (const seq of [1, 2, 3, 4]) s.messages.add(busy.id, seq, `m${seq}`);

    const plain = await s.list.execute(alice, {}, { page: 1, limit: 20 });
    const byId = new Map(plain.items.map((c) => [c.id, c]));
    expect(byId.get(busy.id)?.messageCount).toBe(4);
    expect(byId.get(empty.id)?.messageCount).toBe(0);
    expect(byId.get(busy.id)).not.toHaveProperty('messages');
    expect(s.messages.latestCalls).toBe(0);

    const withMessages = await s.list.execute(
      alice,
      {},
      { page: 1, limit: 20 },
      { includeMessages: true, latestMessages: 2 },
    );
    const items = new Map(withMessages.items.map((c) => [c.id, c]));
    expect(items.get(busy.id)?.messages?.map((m) => m.sequence)).toEqual([
      4, 3,
    ]);
    expect(items.get(empty.id)?.messages).toEqual([]);
  });

  it('A9: latestMessages=0 with include=messages ⇒ empty arrays, no message query', async () => {
    const s = setup();
    const c = await s.create.execute(alice, { title: 'C' });
    s.messages.add(c.id, 1, 'hello');
    const page = await s.list.execute(
      alice,
      {},
      { page: 1, limit: 20 },
      { includeMessages: true, latestMessages: 0 },
    );
    expect(page.items[0]?.messages).toEqual([]);
    expect(page.items[0]?.messageCount).toBe(1);
    expect(s.messages.latestCalls).toBe(0);
  });

  it('A9: search matches the title OR a message content', async () => {
    const s = setup();
    const byTitle = await s.create.execute(alice, { title: 'Invoice March' });
    const byContent = await s.create.execute(alice, { title: 'Untitled' });
    await s.create.execute(alice, { title: 'Nothing here' });
    s.messages.add(byContent.id, 1, 'please check the INVOICE total');

    const found = await s.list.execute(
      alice,
      { search: 'invoice' },
      { page: 1, limit: 20 },
    );
    expect(found.items.map((c) => c.id).sort()).toEqual(
      [byTitle.id, byContent.id].sort(),
    );
  });
});
