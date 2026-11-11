import {
  FakeMessageAccess,
  InMemoryFeedbackRepository,
} from '@test-support/feedback-fakes';
import { FixedClock, SequentialIds } from '@test-support/fakes';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/app-error';
import {
  CreateFeedbackUseCase,
  GetFeedbackUseCase,
  UpdateFeedbackUseCase,
} from './feedback.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };

function setup() {
  const repo = new InMemoryFeedbackRepository();
  const messages = new FakeMessageAccess({
    alice: ['m-alice'],
    bob: ['m-bob'],
  });
  const clock = new FixedClock();
  return {
    repo,
    clock,
    create: new CreateFeedbackUseCase(
      repo,
      messages,
      clock,
      new SequentialIds(),
    ),
    get: new GetFeedbackUseCase(repo, messages),
    update: new UpdateFeedbackUseCase(repo, messages, clock),
  };
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((e: unknown) => e);
  return (error as { reason: string }).reason;
}

describe('feedback use cases', () => {
  it('A30: rates my message; blank comment stored as null', async () => {
    const s = setup();
    const view = await s.create.execute(alice, 'm-alice', {
      rating: 4,
      comment: '  ',
    });
    expect(view).toMatchObject({
      messageId: 'm-alice',
      userId: 'alice',
      rating: 4,
      comment: null,
    });
  });

  it('A30: a second create ⇒ 409 feedback_exists (no upsert)', async () => {
    const s = setup();
    await s.create.execute(alice, 'm-alice', { rating: 5 });
    const error = await s.create
      .execute(alice, 'm-alice', { rating: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).reason).toBe('feedback_exists');
    await expect(s.get.execute(alice, 'm-alice')).resolves.toHaveProperty(
      'rating',
      5,
    );
  });

  it('security fix: a message I cannot see ⇒ 404 message_not_found for every route', async () => {
    const s = setup();
    await s.create.execute(bob, 'm-bob', { rating: 3 });
    expect(
      await reasonOf(s.create.execute(alice, 'm-bob', { rating: 1 })),
    ).toBe('message_not_found');
    expect(await reasonOf(s.get.execute(alice, 'm-bob'))).toBe(
      'message_not_found',
    );
    expect(
      await reasonOf(s.update.execute(alice, 'm-bob', { rating: 1 })),
    ).toBe('message_not_found');
  });

  it('A32: no feedback yet ⇒ 404 feedback_not_found (Python: data null)', async () => {
    const s = setup();
    const error = await s.get
      .execute(alice, 'm-alice')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).reason).toBe('feedback_not_found');
  });

  it('A34: updates rating, comment null clears it, updatedAt moves', async () => {
    const s = setup();
    const created = await s.create.execute(alice, 'm-alice', {
      rating: 2,
      comment: 'meh',
    });
    s.clock.advance(1000);
    const updated = await s.update.execute(alice, 'm-alice', {
      rating: 5,
      comment: null,
    });
    expect(updated).toMatchObject({ id: created.id, rating: 5, comment: null });
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('domain rejects a rating outside 1..5', async () => {
    const s = setup();
    await expect(
      s.create.execute(alice, 'm-alice', { rating: 6 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
