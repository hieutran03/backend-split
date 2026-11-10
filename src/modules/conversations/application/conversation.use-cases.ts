import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import { mapPage, type Page, type PageRequest } from '@shared/pagination/page';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import { Conversation } from '../domain/conversation';
import type {
  ConversationListFilter,
  ConversationRepository,
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
