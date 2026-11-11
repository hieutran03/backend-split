import type { ConversationMembership } from '@modules/projects/application/ports/conversation-membership';
import type { ProjectRepository } from '@modules/projects/application/ports/project.repository';
import { Project } from '@modules/projects/domain/project';
import { toPage, type Page, type PageRequest } from '@shared/pagination/page';

export class InMemoryProjectRepository implements ProjectRepository {
  public readonly rows = new Map<string, Project>();

  public findOwned(id: string, ownerId: string): Promise<Project | null> {
    const p = this.rows.get(id);
    if (!p || p.isDeleted || !p.isOwnedBy(ownerId))
      return Promise.resolve(null);
    return Promise.resolve(Project.restore(p.snapshot()));
  }

  public findOwnedForUpdate(
    id: string,
    ownerId: string,
  ): Promise<Project | null> {
    return this.findOwned(id, ownerId);
  }

  public findOwnedForShare(
    id: string,
    ownerId: string,
  ): Promise<Project | null> {
    return this.findOwned(id, ownerId);
  }

  public listOwned(ownerId: string, page: PageRequest): Promise<Page<Project>> {
    const all = [...this.rows.values()].filter(
      (p) => p.isOwnedBy(ownerId) && !p.isDeleted,
    );
    const items = all.slice(
      (page.page - 1) * page.limit,
      page.page * page.limit,
    );
    return Promise.resolve(toPage(items, all.length, page));
  }

  public insert(project: Project): Promise<void> {
    this.rows.set(project.id, Project.restore(project.snapshot()));
    return Promise.resolve();
  }

  public save(project: Project): Promise<void> {
    return this.insert(project);
  }
}

/** conversations.project_id, keyed by conversation id, plus each conversation's owner. */
export class InMemoryConversationMembership implements ConversationMembership {
  public readonly conversations = new Map<
    string,
    { ownerId: string; projectId: string | null; deleted: boolean }
  >();

  public add(
    id: string,
    ownerId: string,
    projectId: string | null = null,
  ): void {
    this.conversations.set(id, { ownerId, projectId, deleted: false });
  }

  public lockOwnedConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<{ projectId: string | null } | null> {
    const c = this.conversations.get(conversationId);
    if (!c || c.deleted || c.ownerId !== ownerId) return Promise.resolve(null);
    return Promise.resolve({ projectId: c.projectId });
  }

  public setProject(
    conversationId: string,
    projectId: string | null,
  ): Promise<void> {
    const c = this.conversations.get(conversationId);
    if (c) c.projectId = projectId;
    return Promise.resolve();
  }

  public detachAll(projectId: string): Promise<number> {
    let n = 0;
    for (const c of this.conversations.values()) {
      if (c.projectId === projectId) {
        c.projectId = null;
        n += 1;
      }
    }
    return Promise.resolve(n);
  }
}
