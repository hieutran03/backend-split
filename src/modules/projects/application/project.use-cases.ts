import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import { mapPage, type Page, type PageRequest } from '@shared/pagination/page';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { Outbox } from '@platform/ports/outbox.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import { Project } from '../domain/project';
import type { ProjectRepository } from './ports/project.repository';
import { toProjectView, type ProjectView } from './project.view';

/**
 * Use case của projects (PJ1–PJ5). Mỗi class một việc, constructor injection
 * thuần — không decorator Nest, test bằng `new` + fake.
 *
 * Module nhỏ có thể gom use case vào 1 file như ở đây; module lớn (generations)
 * tách mỗi use case một file trong application/use-cases/.
 */

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
  readonly instructions?: string | null;
}

export class CreateProjectUseCase {
  public constructor(
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(
    actor: Actor,
    input: CreateProjectInput,
  ): Promise<ProjectView> {
    const project = Project.create({
      id: this.ids.uuid(),
      ownerId: actor.userId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      now: this.clock.now(),
    });
    await this.projects.insert(project);
    return toProjectView(project);
  }
}

export class ListProjectsUseCase {
  public constructor(private readonly projects: ProjectRepository) {}

  public async execute(
    actor: Actor,
    page: PageRequest,
  ): Promise<Page<ProjectView>> {
    const result = await this.projects.listOwned(actor.userId, page);
    return mapPage(result, toProjectView);
  }
}

export class GetProjectUseCase {
  public constructor(private readonly projects: ProjectRepository) {}

  public async execute(actor: Actor, projectId: string): Promise<ProjectView> {
    const project = await this.projects.findOwned(projectId, actor.userId);
    if (!project) throw new NotFoundError('project');
    return toProjectView(project);
  }
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly instructions?: string | null;
}

export class UpdateProjectUseCase {
  public constructor(
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Actor,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectView> {
    const project = await this.projects.findOwned(projectId, actor.userId);
    if (!project) throw new NotFoundError('project');
    project.update(input, this.clock.now());
    await this.projects.save(project);
    return toProjectView(project);
  }
}

/**
 * PJ5: xoá mềm project + outbox `project.deleted` trong CÙNG transaction.
 * Engine nhận event để xoá mềm user_memories của project (C19) — backend không
 * ghi bảng của Engine nữa.
 *
 * TODO(PJ-05): khoá project trước hội thoại (thứ tự khoá như Python) và quyết định
 * xử lý conversations.project_id đang gắn (set NULL hay chặn) — xem §11 "Projects".
 */
export class DeleteProjectUseCase {
  public constructor(
    private readonly projects: ProjectRepository,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public async execute(actor: Actor, projectId: string): Promise<void> {
    await this.transactions.run(async () => {
      const project = await this.projects.findOwned(projectId, actor.userId);
      if (!project) throw new NotFoundError('project');
      project.softDelete(this.clock.now());
      await this.projects.save(project);
      await this.outbox.enqueue({
        eventType: 'project.deleted',
        aggregateType: 'project',
        aggregateId: project.id,
        payload: { projectId: project.id, ownerId: project.ownerId },
      });
    });
  }
}
