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
 * Projects use cases (PJ1–PJ5). One class per job, plain constructor injection
 * — no Nest decorators, tested with `new` + fakes.
 *
 * A small module may group its use cases in one file like this; a large module (generations)
 * splits each use case into its own file under application/use-cases/.
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
 * PJ5: soft-deletes the project + `project.deleted` outbox in the SAME transaction.
 * The Engine receives the event to soft-delete the project's user_memories (C19) — the backend
 * no longer writes the Engine's tables.
 *
 * TODO(PJ-05): lock the project before conversations (lock order as in Python) and decide
 * how to handle attached conversations.project_id (set NULL or block) — see §11 "Projects".
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
