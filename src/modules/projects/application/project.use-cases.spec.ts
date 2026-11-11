import {
  FixedClock,
  ImmediateTransactions,
  RecordingOutbox,
  SequentialIds,
} from '@test-support/fakes';
import {
  InMemoryConversationMembership,
  InMemoryProjectRepository,
} from '@test-support/in-memory-project.repository';
import { NotFoundError, ValidationError } from '@shared/errors/app-error';
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from './project.use-cases';
import {
  AttachConversationUseCase,
  DetachConversationUseCase,
} from './membership.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };

function setup() {
  const repo = new InMemoryProjectRepository();
  const clock = new FixedClock();
  const ids = new SequentialIds();
  const outbox = new RecordingOutbox();
  const tx = new ImmediateTransactions();
  const membership = new InMemoryConversationMembership();
  return {
    repo,
    membership,
    clock,
    outbox,
    tx,
    create: new CreateProjectUseCase(repo, clock, ids),
    list: new ListProjectsUseCase(repo),
    get: new GetProjectUseCase(repo),
    update: new UpdateProjectUseCase(repo, clock),
    remove: new DeleteProjectUseCase(repo, membership, outbox, tx, clock),
    attach: new AttachConversationUseCase(repo, membership, tx, clock),
    detach: new DetachConversationUseCase(repo, membership, tx, clock),
  };
}

describe('projects use cases', () => {
  it('creates project, trims name, empty string => null', async () => {
    const s = setup();
    const view = await s.create.execute(alice, {
      name: '  Q3 report  ',
      description: '   ',
    });
    expect(view.name).toBe('Q3 report');
    expect(view.description).toBeNull();
    expect(s.repo.rows.size).toBe(1);
  });

  it('rejects empty name with ValidationError (400)', async () => {
    const s = setup();
    await expect(
      s.create.execute(alice, { name: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('another user reading the project => 404, not 403 (D15)', async () => {
    const s = setup();
    const view = await s.create.execute(alice, { name: 'Secret' });
    await expect(s.get.execute(bob, view.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      s.update.execute(bob, view.id, { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.remove.execute(bob, view.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('list only shows own projects, with pagination meta', async () => {
    const s = setup();
    await s.create.execute(alice, { name: 'A1' });
    await s.create.execute(alice, { name: 'A2' });
    await s.create.execute(bob, { name: 'B1' });
    const page = await s.list.execute(alice, { page: 1, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('update changes updatedAt according to the clock', async () => {
    const s = setup();
    const created = await s.create.execute(alice, { name: 'Old' });
    s.clock.advance(60_000);
    const updated = await s.update.execute(alice, created.id, {
      name: 'New',
      instructions: 'Answer briefly',
    });
    expect(updated.name).toBe('New');
    expect(updated.instructions).toBe('Answer briefly');
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('delete: soft delete + project.deleted outbox in 1 transaction', async () => {
    const s = setup();
    const created = await s.create.execute(alice, { name: 'Gone' });
    await s.remove.execute(alice, created.id);
    expect(s.tx.runs).toBe(1);
    expect(s.outbox.events).toEqual([
      expect.objectContaining({
        eventType: 'project.deleted',
        aggregateId: created.id,
      }),
    ]);
    await expect(s.get.execute(alice, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('PJ-05: delete detaches every conversation of the project and reports the count', async () => {
    const s = setup();
    const p = await s.create.execute(alice, { name: 'Doomed' });
    s.membership.add('c1', 'alice', p.id);
    s.membership.add('c2', 'alice', p.id);
    s.membership.add('c3', 'alice', null);
    await s.remove.execute(alice, p.id);
    expect(
      [...s.membership.conversations.values()].map((c) => c.projectId),
    ).toEqual([null, null, null]);
    expect(s.outbox.events[0]?.payload).toEqual({
      projectId: p.id,
      ownerId: 'alice',
      detachedConversations: 2,
    });
  });

  it('PJ6: attaches / moves my conversation into my project, idempotent', async () => {
    const s = setup();
    const a = await s.create.execute(alice, { name: 'A' });
    const b = await s.create.execute(alice, { name: 'B' });
    s.membership.add('c1', 'alice', a.id);
    await expect(s.attach.execute(alice, b.id, 'c1')).resolves.toEqual({
      conversationId: 'c1',
      projectId: b.id,
    });
    await s.attach.execute(alice, b.id, 'c1');
    expect(s.membership.conversations.get('c1')?.projectId).toBe(b.id);
  });

  it('PJ6: ownership on both sides ⇒ 404 project_not_found / conversation_not_found', async () => {
    const s = setup();
    const mine = await s.create.execute(alice, { name: 'Mine' });
    const theirs = await s.create.execute(bob, { name: 'Theirs' });
    s.membership.add('c-alice', 'alice');
    s.membership.add('c-bob', 'bob');
    const reason = (p: Promise<unknown>) =>
      p.catch((e: unknown) => (e as NotFoundError).reason);
    expect(await reason(s.attach.execute(alice, theirs.id, 'c-alice'))).toBe(
      'project_not_found',
    );
    expect(await reason(s.attach.execute(alice, mine.id, 'c-bob'))).toBe(
      'conversation_not_found',
    );
    expect(s.membership.conversations.get('c-alice')?.projectId).toBeNull();
  });

  it('PJ7: detaches; a conversation not in this project ⇒ 404 conversation_not_in_project', async () => {
    const s = setup();
    const a = await s.create.execute(alice, { name: 'A' });
    const b = await s.create.execute(alice, { name: 'B' });
    s.membership.add('c1', 'alice', a.id);
    const wrong = await s.detach
      .execute(alice, b.id, 'c1')
      .catch((e: unknown) => e);
    expect((wrong as NotFoundError).reason).toBe('conversation_not_in_project');
    await expect(s.detach.execute(alice, a.id, 'c1')).resolves.toEqual({
      conversationId: 'c1',
      projectId: null,
    });
  });
});
