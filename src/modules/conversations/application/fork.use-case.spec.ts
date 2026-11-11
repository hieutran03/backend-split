import {
  FakeForkFingerprint,
  FakeForkMessages,
  FakeProjectAccess,
  FakeTurnLock,
  InMemoryConversationRepository,
} from '@test-support/conversation-fakes';
import {
  FixedClock,
  ImmediateTransactions,
  RecordingOutbox,
  SequentialIds,
} from '@test-support/fakes';
import {
  type AppError,
  ConflictError,
  NotFoundError,
} from '@shared/errors/app-error';
import { Conversation } from '../domain/conversation';
import { FORK_MAX_MESSAGES, ForkConversationUseCase } from './fork.use-case';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };
const SOURCE = 'src-1';

function setup() {
  const repo = new InMemoryConversationRepository();
  const clock = new FixedClock();
  const messages = new FakeForkMessages();
  const outbox = new RecordingOutbox();
  const lock = new FakeTurnLock();
  void repo.insert(
    Conversation.start({
      id: SOURCE,
      ownerId: 'alice',
      title: 'Source',
      personaPrompt: 'Be brief',
      planningModeEnabled: true,
      projectId: 'p-alice',
      now: clock.now(),
    }),
  );
  messages.add(SOURCE, 'm1', 1, 'user');
  messages.add(SOURCE, 'm2', 2, 'assistant');
  messages.add(SOURCE, 'm3', 3, 'user');
  messages.add(SOURCE, 'm4', 4, 'assistant');
  return {
    repo,
    clock,
    messages,
    outbox,
    lock,
    fork: new ForkConversationUseCase(
      repo,
      new FakeProjectAccess({ alice: ['p-alice'] }),
      messages,
      new FakeForkFingerprint(),
      lock,
      new ImmediateTransactions(),
      outbox,
      clock,
      new SequentialIds(),
    ),
  };
}

async function errorOf(p: Promise<unknown>): Promise<AppError> {
  return (await p.catch((e: unknown) => e)) as AppError;
}

describe('fork conversation (A12a)', () => {
  it('creates the child through the message: lineage, copied settings, prefix copy, outbox, turn lock', async () => {
    const s = setup();
    const result = await s.fork.execute(alice, SOURCE, {
      messageId: 'm2',
      requestId: 'r1',
    });

    expect(result.created).toBe(true);
    expect(result.conversation).toMatchObject({
      ownerId: 'alice',
      title: 'Source',
      personaPrompt: 'Be brief',
      planningModeEnabled: true,
      projectId: 'p-alice',
      forkedFromConversationId: SOURCE,
      forkedFromMessageId: 'm2',
      forkedThroughSequence: 2,
      planLifecycle: null,
    });
    const child = s.repo.rows.get(result.conversation.id)?.snapshot();
    expect(child?.nextMessageSequence).toBe(3);
    expect(s.messages.copies).toEqual([
      { sourceId: SOURCE, childId: result.conversation.id, through: 2 },
    ]);
    expect(s.lock.locked).toEqual([SOURCE]);
    expect(s.outbox.events).toEqual([
      expect.objectContaining({
        eventType: 'conversation.forked',
        aggregateId: result.conversation.id,
        payload: expect.objectContaining({
          sourceConversationId: SOURCE,
          forkedThroughSequence: 2,
        }) as unknown,
      }),
    ]);
  });

  it('replay with the same requestId + body ⇒ 200 with the same child, nothing new', async () => {
    const s = setup();
    const first = await s.fork.execute(alice, SOURCE, {
      messageId: 'm2',
      requestId: 'r1',
      title: 'Branch',
    });
    const again = await s.fork.execute(alice, SOURCE, {
      messageId: 'm2',
      requestId: 'r1',
      title: 'Branch',
    });
    expect(again).toEqual({ created: false, conversation: first.conversation });
    expect(s.outbox.events).toHaveLength(1);
    expect(s.messages.copies).toHaveLength(1);
  });

  it('same requestId, different body ⇒ 409 request_conflict; child deleted ⇒ 410 result_deleted', async () => {
    const s = setup();
    const first = await s.fork.execute(alice, SOURCE, {
      messageId: 'm2',
      requestId: 'r1',
    });
    const conflict = await errorOf(
      s.fork.execute(alice, SOURCE, { messageId: 'm4', requestId: 'r1' }),
    );
    expect(conflict).toBeInstanceOf(ConflictError);
    expect(conflict.reason).toBe('request_conflict');

    s.repo.markDeleted(first.conversation.id, s.clock.now());
    const gone = await errorOf(
      s.fork.execute(alice, SOURCE, { messageId: 'm2', requestId: 'r1' }),
    );
    expect(gone.code).toBe('gone');
    expect(gone.reason).toBe('result_deleted');
  });

  it('refusals: not my source (404), message not in source (404), user message (409)', async () => {
    const s = setup();
    const notMine = await errorOf(
      s.fork.execute(bob, SOURCE, { messageId: 'm2', requestId: 'r1' }),
    );
    expect(notMine).toBeInstanceOf(NotFoundError);
    expect(notMine.reason).toBe('conversation_not_found');

    const unknown = await errorOf(
      s.fork.execute(alice, SOURCE, { messageId: 'nope', requestId: 'r2' }),
    );
    expect(unknown.reason).toBe('message_not_found');

    const userMessage = await errorOf(
      s.fork.execute(alice, SOURCE, { messageId: 'm3', requestId: 'r3' }),
    );
    expect(userMessage.reason).toBe('message_not_forkable');
    expect(s.outbox.events).toHaveLength(0);
  });

  it('prefix over the limits ⇒ 413 fork_too_large', async () => {
    const s = setup();
    for (let i = 5; i <= FORK_MAX_MESSAGES + 2; i += 1) {
      s.messages.add(SOURCE, `x${i}`, i, i % 2 === 0 ? 'assistant' : 'user');
    }
    const tooMany = await errorOf(
      s.fork.execute(alice, SOURCE, {
        messageId: `x${FORK_MAX_MESSAGES + 2}`,
        requestId: 'r1',
      }),
    );
    expect(tooMany.code).toBe('payload_too_large');

    const s2 = setup();
    s2.messages.add(SOURCE, 'huge', 5, 'user', 33 * 1024 * 1024);
    s2.messages.add(SOURCE, 'm6', 6, 'assistant');
    const tooBig = await errorOf(
      s2.fork.execute(alice, SOURCE, { messageId: 'm6', requestId: 'r1' }),
    );
    expect(tooBig.reason).toBe('fork_too_large');
  });
});
