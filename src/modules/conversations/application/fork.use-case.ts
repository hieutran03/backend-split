import type { Actor } from '@shared/auth/actor';
import {
  AppError,
  ConflictError,
  NotFoundError,
} from '@shared/errors/app-error';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { Outbox } from '@platform/ports/outbox.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import type { ConversationTurnLock } from '@platform/ports/turn-lock.port';
import { Conversation } from '../domain/conversation';
import { toConversationView, type ConversationView } from './conversation.view';
import {
  type ConversationRepository,
  type ForkFingerprint,
  type ForkMessages,
  ForkRequestTakenError,
  type ProjectAccess,
} from './ports';

/** A12a limits (Python `conversation_fork_*` settings, values from the spec). */
export const FORK_MAX_MESSAGES = 5_000;
export const FORK_MAX_BYTES = 32 * 1024 * 1024;

export interface ForkInput {
  readonly messageId: string;
  readonly requestId: string;
  readonly title?: string | null | undefined;
}

export interface ForkResult {
  /** true ⇒ 201 (new child); false ⇒ 200 (replay of the same request). */
  readonly created: boolean;
  readonly conversation: ConversationView;
}

/**
 * A12a — fork a conversation through a completed assistant message (sequence S8).
 *
 *  1. preflight: (owner, requestId) already used? same fingerprint ⇒ 200 replay,
 *     other fingerprint ⇒ 409 request_conflict, child deleted ⇒ 410 result_deleted;
 *  2. hold the SOURCE turn lock (≤ 30 s, shared key with Python);
 *  3. REPEATABLE READ transaction, rerun on 40001: lock project (FOR SHARE), then the
 *     source conversation (FOR UPDATE) — same order as deleting a project;
 *  4. checks: message in source (404), assistant (409), prefix ≤ 5 000 messages
 *     and ≤ 32 MB (413);
 *  5. insert child + copy the prefix + outbox `conversation.forked` (the Engine
 *     prepares the child's first-turn summary; Python wrote conversation_summary_jobs).
 * A concurrent fork with the same requestId loses on the unique index and answers
 * like a replay.
 *
 * Not checked yet, because the tables do not exist (TC-56): active generation (409,
 * W4), attached documents (409, W3); custom agents are not copied (W2).
 */
export class ForkConversationUseCase {
  public constructor(
    private readonly conversations: ConversationRepository,
    private readonly projects: ProjectAccess,
    private readonly messages: ForkMessages,
    private readonly fingerprints: ForkFingerprint,
    private readonly turnLock: ConversationTurnLock,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(
    actor: Actor,
    sourceId: string,
    input: ForkInput,
  ): Promise<ForkResult> {
    const fingerprint = this.fingerprints.of({
      sourceConversationId: sourceId,
      messageId: input.messageId,
      title: input.title ?? null,
    });
    const replay = await this.replay(actor, input.requestId, fingerprint);
    if (replay) return replay;
    try {
      return await this.turnLock.withLock(sourceId, () =>
        this.transactions.run(
          () => this.forkInTransaction(actor, sourceId, input, fingerprint),
          { isolation: 'REPEATABLE READ', retriesOnSerializationFailure: 2 },
        ),
      );
    } catch (error) {
      if (!(error instanceof ForkRequestTakenError)) throw error;
      const raced = await this.replay(actor, input.requestId, fingerprint);
      if (raced) return raced;
      throw error;
    }
  }

  private async replay(
    actor: Actor,
    requestId: string,
    fingerprint: string,
  ): Promise<ForkResult | null> {
    const previous = await this.conversations.findForkRequest(
      actor.userId,
      requestId,
    );
    if (!previous) return null;
    if (previous.child.isDeleted) {
      throw new AppError(
        'gone',
        'The conversation created by this request was deleted',
        'result_deleted',
      );
    }
    if (previous.fingerprint !== fingerprint) {
      throw new ConflictError(
        'requestId was already used for a different fork',
        'request_conflict',
      );
    }
    return { created: false, conversation: toConversationView(previous.child) };
  }

  private async forkInTransaction(
    actor: Actor,
    sourceId: string,
    input: ForkInput,
    fingerprint: string,
  ): Promise<ForkResult> {
    const peek = await this.conversations.findOwned(sourceId, actor.userId);
    if (!peek) throw new NotFoundError('conversation');
    const projectId = peek.snapshot().projectId;
    if (projectId) {
      // Lock order: project, then conversation. The result is not needed: a project
      // being deleted detaches the source first, which this snapshot would see.
      await this.projects.lockOwnedActiveProject(actor.userId, projectId);
    }
    const source = await this.conversations.findOwnedForUpdate(
      sourceId,
      actor.userId,
    );
    if (!source) throw new NotFoundError('conversation');

    const message = await this.messages.findMessage(sourceId, input.messageId);
    if (!message) throw new NotFoundError('message');
    if (message.sender !== 'assistant') {
      throw new ConflictError(
        'Only a completed assistant message can be forked',
        'message_not_forkable',
      );
    }
    const size = await this.messages.prefixSize(sourceId, message.sequence);
    if (size.count > FORK_MAX_MESSAGES || size.bytes > FORK_MAX_BYTES) {
      throw new AppError(
        'payload_too_large',
        'The conversation prefix is too large to fork',
        'fork_too_large',
        { messages: size.count, bytes: size.bytes },
      );
    }

    const child = Conversation.forkFrom(source, {
      id: this.ids.uuid(),
      title: input.title,
      messageId: input.messageId,
      throughSequence: message.sequence,
      copiedMessages: size.count,
      now: this.clock.now(),
    });
    await this.conversations.insertFork(child, {
      requestId: input.requestId,
      fingerprint,
    });
    const copied = await this.messages.copyPrefix(
      sourceId,
      child.id,
      message.sequence,
    );
    if (copied !== size.count) {
      // The snapshot guarantees equality; anything else is a bug, not a user error.
      throw new Error(`fork copied ${copied} messages, expected ${size.count}`);
    }
    await this.outbox.enqueue({
      eventType: 'conversation.forked',
      aggregateType: 'conversation',
      aggregateId: child.id,
      payload: {
        childConversationId: child.id,
        sourceConversationId: sourceId,
        ownerId: actor.userId,
        forkedFromMessageId: input.messageId,
        forkedThroughSequence: message.sequence,
      },
    });
    return { created: true, conversation: toConversationView(child) };
  }
}
