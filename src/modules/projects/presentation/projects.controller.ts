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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';
import { type Page } from '@shared/pagination/page';
import { CurrentActor, ResponseMessage } from '@platform/http/decorators';
import {
  paginationQuerySchema,
  type PaginationQuery,
  uuidParamSchema,
} from '@platform/http/pagination.query';
import {
  ApiEnvelope,
  ApiErrors,
  ApiUuidParam,
  ApiZodBody,
  ApiZodQuery,
} from '@platform/http/openapi';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from '../application/project.use-cases';
import {
  AttachConversationUseCase,
  DetachConversationUseCase,
  type MembershipView,
} from '../application/membership.use-cases';
import { type ProjectView } from '../application/project.view';
import {
  type CreateProjectBody,
  createProjectSchema,
  membershipViewSchema,
  projectViewSchema,
  type UpdateProjectBody,
  updateProjectSchema,
} from './projects.schemas';

/**
 * Thin controller: validate → call use case → return data (envelope added by the interceptor).
 * No business logic here.
 *
 * Mapping: PJ1–PJ7 (§4.2). PJ8–PJ9 (custom agents) are task PJ-08 (W2).
 */
@ApiTags('projects')
@ApiBearerAuth(BEARER_AUTH)
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
    @Inject(AttachConversationUseCase)
    private readonly attachConversation: AttachConversationUseCase,
    @Inject(DetachConversationUseCase)
    private readonly detachConversation: DetachConversationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my projects (PJ1)' })
  @ApiZodQuery(paginationQuerySchema)
  @ApiEnvelope(projectViewSchema, {
    paginated: true,
    message: 'Get data successfully',
  })
  @ApiErrors(400, 401)
  @ResponseMessage('Get data successfully')
  public list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Page<ProjectView>> {
    return this.listProjects.execute(actor, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create project (PJ2)' })
  @ApiZodBody(createProjectSchema)
  @ApiEnvelope(projectViewSchema, {
    status: 201,
    message: 'Created successfully',
  })
  @ApiErrors(400, 401)
  @ResponseMessage('Created successfully')
  public create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectBody,
  ): Promise<ProjectView> {
    return this.createProject.execute(actor, body);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Project details (PJ3)' })
  @ApiUuidParam('projectId')
  @ApiEnvelope(projectViewSchema)
  @ApiErrors(400, 401, 404)
  public get(
    @CurrentActor() actor: Actor,
    @Param('projectId', new ZodValidationPipe(uuidParamSchema))
    projectId: string,
  ): Promise<ProjectView> {
    return this.getProject.execute(actor, projectId);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update project (PJ4)' })
  @ApiUuidParam('projectId')
  @ApiZodBody(updateProjectSchema)
  @ApiEnvelope(projectViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
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
  @ApiOperation({
    summary: 'Soft-delete project (PJ5)',
    description:
      "Detaches every conversation of the project (they are kept) and writes the `project.deleted` outbox in the same transaction — the Engine soft-deletes the project's user_memories.",
  })
  @ApiUuidParam('projectId')
  @ApiEnvelope(null, { message: 'Deleted successfully' })
  @ApiErrors(400, 401, 404)
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

  @Put(':projectId/conversations/:conversationId')
  @ApiOperation({
    summary: 'Move a conversation into the project (PJ6)',
    description:
      'Both must be mine (404 project_not_found / conversation_not_found). A conversation in another project is moved. Idempotent.',
  })
  @ApiUuidParam('projectId')
  @ApiUuidParam('conversationId')
  @ApiEnvelope(membershipViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
  @ResponseMessage('Updated successfully')
  public attach(
    @CurrentActor() actor: Actor,
    @Param('projectId', new ZodValidationPipe(uuidParamSchema))
    projectId: string,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
  ): Promise<MembershipView> {
    return this.attachConversation.execute(actor, projectId, conversationId);
  }

  @Delete(':projectId/conversations/:conversationId')
  @ApiOperation({
    summary: 'Remove a conversation from the project (PJ7)',
    description:
      'A conversation that is not in this project ⇒ 404 conversation_not_in_project.',
  })
  @ApiUuidParam('projectId')
  @ApiUuidParam('conversationId')
  @ApiEnvelope(membershipViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
  @HttpCode(200)
  @ResponseMessage('Updated successfully')
  public detach(
    @CurrentActor() actor: Actor,
    @Param('projectId', new ZodValidationPipe(uuidParamSchema))
    projectId: string,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
  ): Promise<MembershipView> {
    return this.detachConversation.execute(actor, projectId, conversationId);
  }
}
