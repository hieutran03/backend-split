import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import { mapPage, type Page, type PageRequest } from '@shared/pagination/page';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { Outbox } from '@platform/ports/outbox.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import { Conversation } from '../domain/conversation';
import type {
  ConversationListFilter,
  ConversationRepository,
  ConversationThreadSource,
  ProjectAccess,
} from './ports';
import { toConversationView, type ConversationView } from './conversation.view';

export interface CreateConversationInput {
  readonly title: string;
  readonly personaPrompt?: string | null | undefined;
  readonly planningModeEnabled?: boolean | undefined;
  readonly projectId?: string | null | undefined;
}

/**
 * A7 — Create. A `projectId` that is unknown, deleted or someone else's answers
 * 404 project_not_found (D15) — the caller cannot learn that the project exists.
 */
export class CreateConversationUseCase {
  public constructor(
    private readonly conversations: ConversationRepository,
    private readonly projects: ProjectAccess,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(
    actor: Actor,
    input: CreateConversationInput,
  ): Promise<ConversationView> {
    if (
      input.projectId &&
      !(await this.projects.ownsActiveProject(actor.userId, input.projectId))
    ) {
      throw new NotFoundError('project');
    }
    const conversation = Conversation.start({
      id: this.ids.uuid(),
      ownerId: actor.userId,
      title: input.title,
      personaPrompt: input.personaPrompt,
      planningModeEnabled: input.planningModeEnabled,
      projectId: input.projectId ?? null,
      now: this.clock.now(),
    });
    await this.conversations.insert(conversation);
    return toConversationView(conversation);
  }
}

/** A9 — List the caller's conversations (S2 pagination, default sort -updatedAt). */
export class ListConversationsUseCase {
  public constructor(private readonly conversations: ConversationRepository) {}

  public async execute(
    actor: Actor,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<Page<ConversationView>> {
    const result = await this.conversations.listOwned(
      actor.userId,
      filter,
      page,
    );
    return mapPage(result, toConversationView);
  }
}

/** A8. */
export class GetConversationUseCase {
  public constructor(private readonly conversations: ConversationRepository) {}

  public async execute(
    actor: Actor,
    conversationId: string,
  ): Promise<ConversationView> {
    const conversation = await this.conversations.findOwned(
      conversationId,
      actor.userId,
    );
    if (!conversation) throw new NotFoundError('conversation');
    return toConversationView(conversation);
  }
}

export interface UpdateConversationInput {
  readonly title?: string | undefined;
  readonly personaPrompt?: string | null | undefined;
  readonly planningModeEnabled?: boolean | undefined;
}

/** A11 — `title: null` is rejected by the schema; `personaPrompt: null` clears it. */
export class UpdateConversationUseCase {
  public constructor(
    private readonly conversations: ConversationRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Actor,
    conversationId: string,
    input: UpdateConversationInput,
  ): Promise<ConversationView> {
    const conversation = await this.conversations.findOwned(
      conversationId,
      actor.userId,
    );
    if (!conversation) throw new NotFoundError('conversation');
    conversation.update(input, this.clock.now());
    await this.conversations.save(conversation);
    return toConversationView(conversation);
  }
}

/** Payload of the `conversation.deleted` outbox event (consumed by OBX-02). */
export interface ConversationDeletedPayload {
  readonly conversationId: string;
  readonly ownerId: string;
  /** Checkpoint threads to delete through E5 (may be empty). */
  readonly threadIds: string[];
}

/**
 * A12 (+ A25 folded in) — soft delete + `conversation.deleted` outbox in ONE
 * transaction (D9). The row is locked first so two concurrent deletes cannot both
 * enqueue an event: the second one waits, then sees the row deleted ⇒ 404.
 *
 * An active turn does NOT block the delete (spec A12, TC-33): the publisher stops it
 * through E2 before calling E5. Fork children are kept.
 */
export class DeleteConversationUseCase {
  public constructor(
    private readonly conversations: ConversationRepository,
    private readonly threads: ConversationThreadSource,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public async execute(actor: Actor, conversationId: string): Promise<void> {
    await this.transactions.run(async () => {
      const conversation = await this.conversations.findOwnedForUpdate(
        conversationId,
        actor.userId,
      );
      if (!conversation) throw new NotFoundError('conversation');
      conversation.softDelete(this.clock.now());
      await this.conversations.save(conversation);

      const payload: ConversationDeletedPayload = {
        conversationId: conversation.id,
        ownerId: actor.userId,
        threadIds: await this.threads.threadIdsOf(conversation.id),
      };
      await this.outbox.enqueue({
        eventType: 'conversation.deleted',
        aggregateType: 'conversation',
        aggregateId: conversation.id,
        payload: { ...payload },
      });
    });
  }
}
