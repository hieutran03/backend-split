import { FixedClock, SequentialIds } from '@test-support/fakes';
import {
  FakeProjectAccess,
  InMemoryConversationRepository,
} from '@test-support/conversation-fakes';
import { NotFoundError, ValidationError } from '@shared/errors/app-error';
import {
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  UpdateConversationUseCase,
} from './conversation.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };

function setup() {
  const repo = new InMemoryConversationRepository();
  const clock = new FixedClock();
  const projects = new FakeProjectAccess({
    alice: ['p-alice'],
    bob: ['p-bob'],
  });
  return {
    repo,
    clock,
    create: new CreateConversationUseCase(
      repo,
      projects,
      clock,
      new SequentialIds(),
    ),
    list: new ListConversationsUseCase(repo),
    get: new GetConversationUseCase(repo),
    update: new UpdateConversationUseCase(repo, clock),
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
});
