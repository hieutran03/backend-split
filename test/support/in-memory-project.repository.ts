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
