import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import type { Clock } from '@platform/ports/kernel.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import type { ConversationMembership } from './ports/conversation-membership';
import type { ProjectRepository } from './ports/project.repository';

export interface MembershipView {
  readonly conversationId: string;
  readonly projectId: string | null;
}

/**
 * PJ6 — move a conversation into the project (from no project or another one).
 * Ownership is checked on both sides (404 project_not_found / conversation_not_found).
 * The project row is share-locked first, so a concurrent delete of the project
 * (which takes FOR UPDATE, then detaches) cannot leave this conversation attached
 * to a deleted project. Seeding the project's custom agents is PJ-08 (TC-45).
 */
export class AttachConversationUseCase {
  public constructor(
    private readonly projects: ProjectRepository,
    private readonly membership: ConversationMembership,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public execute(
    actor: Actor,
    projectId: string,
    conversationId: string,
  ): Promise<MembershipView> {
    return this.transactions.run(async () => {
      const project = await this.projects.findOwnedForShare(
        projectId,
        actor.userId,
      );
      if (!project) throw new NotFoundError('project');
      const conversation = await this.membership.lockOwnedConversation(
        conversationId,
        actor.userId,
      );
      if (!conversation) throw new NotFoundError('conversation');
      if (conversation.projectId !== projectId) {
        await this.membership.setProject(
          conversationId,
          projectId,
          this.clock.now(),
        );
      }
      return { conversationId, projectId };
    });
  }
}

/**
 * PJ7 — remove a conversation from the project. A conversation that is not in
 * this project ⇒ 404 conversation_not_in_project ("detach also reports wrong
 * membership" in Python).
 */
export class DetachConversationUseCase {
  public constructor(
    private readonly projects: ProjectRepository,
    private readonly membership: ConversationMembership,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public execute(
    actor: Actor,
    projectId: string,
    conversationId: string,
  ): Promise<MembershipView> {
    return this.transactions.run(async () => {
      const project = await this.projects.findOwnedForShare(
        projectId,
        actor.userId,
      );
      if (!project) throw new NotFoundError('project');
      const conversation = await this.membership.lockOwnedConversation(
        conversationId,
        actor.userId,
      );
      if (!conversation) throw new NotFoundError('conversation');
      if (conversation.projectId !== projectId) {
        throw new NotFoundError('conversation', 'conversation_not_in_project');
      }
      await this.membership.setProject(conversationId, null, this.clock.now());
      return { conversationId, projectId: null };
    });
  }
}
