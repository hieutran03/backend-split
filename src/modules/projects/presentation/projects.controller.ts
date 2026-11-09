import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { type Actor } from '@shared/auth/actor';
import { type Page } from '@shared/pagination/page';
import { CurrentActor, ResponseMessage } from '@platform/http/decorators';
import {
  paginationQuerySchema,
  type PaginationQuery,
  uuidParamSchema,
} from '@platform/http/pagination.query';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from '../application/project.use-cases';
import { type ProjectView } from '../application/project.view';
import {
  type CreateProjectBody,
  createProjectSchema,
  type UpdateProjectBody,
  updateProjectSchema,
} from './projects.schemas';

/**
 * Controller mỏng: validate → gọi use case → trả data (envelope do interceptor bọc).
 * Không có logic nghiệp vụ ở đây.
 *
 * Mapping: PJ1–PJ5 (§4.2). PJ6–PJ9 (gắn hội thoại, custom agents) là task PJ-06..09.
 */
@Controller('projects')
export class ProjectsController {
  public constructor(
    @Inject(CreateProjectUseCase)
    private readonly createProject: CreateProjectUseCase,
    @Inject(ListProjectsUseCase)
    private readonly listProjects: ListProjectsUseCase,
    @Inject(GetProjectUseCase) private readonly getProject: GetProjectUseCase,
    @Inject(UpdateProjectUseCase)
    private readonly updateProject: UpdateProjectUseCase,
    @Inject(DeleteProjectUseCase)
    private readonly deleteProject: DeleteProjectUseCase,
  ) {}

  @Get()
  @ResponseMessage('Get data successfully')
  public list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Page<ProjectView>> {
    return this.listProjects.execute(actor, query);
  }

  @Post()
  @ResponseMessage('Created successfully')
  public create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectBody,
  ): Promise<ProjectView> {
    return this.createProject.execute(actor, body);
  }

  @Get(':projectId')
  public get(
    @CurrentActor() actor: Actor,
    @Param('projectId', new ZodValidationPipe(uuidParamSchema))
    projectId: string,
  ): Promise<ProjectView> {
    return this.getProject.execute(actor, projectId);
  }

  @Patch(':projectId')
  @ResponseMessage('Updated successfully')
  public update(
    @CurrentActor() actor: Actor,
    @Param('projectId', new ZodValidationPipe(uuidParamSchema))
    projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectBody,
  ): Promise<ProjectView> {
    return this.updateProject.execute(actor, projectId, body);
  }

  @Delete(':projectId')
  @HttpCode(200)
  @ResponseMessage('Deleted successfully')
  public async remove(
    @CurrentActor() actor: Actor,
    @Param('projectId', new ZodValidationPipe(uuidParamSchema))
    projectId: string,
  ): Promise<null> {
    await this.deleteProject.execute(actor, projectId);
    return null;
  }
}
