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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type Actor } from '@shared/auth/actor';
import { CurrentActor, ResponseMessage } from '@platform/http/decorators';
import {
  ApiEnvelope,
  ApiErrors,
  ApiUuidParam,
  ApiZodBody,
  ApiZodQuery,
} from '@platform/http/openapi';
import { uuidParamSchema } from '@platform/http/pagination.query';
import { BEARER_AUTH } from '@platform/http/swagger';
import { ZodValidationPipe } from '@platform/http/zod-validation.pipe';
import {
  AddTasksUseCase,
  CompleteTaskUseCase,
  DeleteTaskUseCase,
  GetPlanningStatusUseCase,
  GetTaskUseCase,
  ListTasksUseCase,
  type PlanningStatusView,
  type TaskPlanView,
  UpdateTaskUseCase,
} from '../application/task-plan.use-cases';
import {
  type AddTasksBody,
  addTasksSchema,
  type ListTasksQuery,
  listTasksQuerySchema,
  planningStatusSchema,
  taskPlanListSchema,
  taskPlanViewSchema,
  type UpdateTaskBody,
  updateTaskSchema,
} from './task-plans.schemas';

/**
 * A36–A42 (manual task plans). Generating a plan with AI (A35, E7) is W4.
 * conversations.plan_lifecycle is not recomputed yet (TP-02, TC-48).
 */
@ApiTags('task-plans')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class TaskPlansController {
  public constructor(
    @Inject(AddTasksUseCase) private readonly addTasks: AddTasksUseCase,
    @Inject(ListTasksUseCase) private readonly listTasks: ListTasksUseCase,
    @Inject(GetTaskUseCase) private readonly getTask: GetTaskUseCase,
    @Inject(UpdateTaskUseCase) private readonly updateTask: UpdateTaskUseCase,
    @Inject(CompleteTaskUseCase)
    private readonly completeTask: CompleteTaskUseCase,
    @Inject(DeleteTaskUseCase) private readonly deleteTask: DeleteTaskUseCase,
    @Inject(GetPlanningStatusUseCase)
    private readonly planningStatus: GetPlanningStatusUseCase,
  ) {}

  @Post('conversations/:conversationId/task-plans')
  @ApiOperation({
    summary: 'Add tasks to the plan (A36)',
    description:
      'Appended after the current last task. Blank descriptions ⇒ 400.',
  })
  @ApiUuidParam('conversationId')
  @ApiZodBody(addTasksSchema)
  @ApiEnvelope(taskPlanListSchema, {
    status: 201,
    message: 'Created successfully',
  })
  @ApiErrors(400, 401, 404)
  @ResponseMessage('Created successfully')
  public add(
    @CurrentActor() actor: Actor,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
    @Body(new ZodValidationPipe(addTasksSchema)) body: AddTasksBody,
  ): Promise<TaskPlanView[]> {
    return this.addTasks.execute(actor, conversationId, body.taskDescriptions);
  }

  @Get('conversations/:conversationId/task-plans')
  @ApiOperation({
    summary: 'List the tasks of a conversation (A37)',
    description:
      'Ordered by taskOrder. Completed and skipped tasks only with includeCompleted=true.',
  })
  @ApiUuidParam('conversationId')
  @ApiZodQuery(listTasksQuerySchema)
  @ApiEnvelope(taskPlanListSchema)
  @ApiErrors(400, 401, 404)
  public list(
    @CurrentActor() actor: Actor,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ): Promise<TaskPlanView[]> {
    return this.listTasks.execute(
      actor,
      conversationId,
      query.includeCompleted,
    );
  }

  @Get('conversations/:conversationId/planning-status')
  @ApiOperation({ summary: 'Planning status and progress (A42)' })
  @ApiUuidParam('conversationId')
  @ApiEnvelope(planningStatusSchema)
  @ApiErrors(400, 401, 404)
  public status(
    @CurrentActor() actor: Actor,
    @Param('conversationId', new ZodValidationPipe(uuidParamSchema))
    conversationId: string,
  ): Promise<PlanningStatusView> {
    return this.planningStatus.execute(actor, conversationId);
  }

  @Get('task-plans/:taskPlanId')
  @ApiOperation({ summary: 'Get a task (A38)' })
  @ApiUuidParam('taskPlanId')
  @ApiEnvelope(taskPlanViewSchema)
  @ApiErrors(400, 401, 404)
  public get(
    @CurrentActor() actor: Actor,
    @Param('taskPlanId', new ZodValidationPipe(uuidParamSchema))
    taskPlanId: string,
  ): Promise<TaskPlanView> {
    return this.getTask.execute(actor, taskPlanId);
  }

  @Patch('task-plans/:taskPlanId')
  @ApiOperation({
    summary: 'Update a task (A39)',
    description:
      '`completedAt` is not accepted: it follows `status`. `taskMetadata: null` clears it.',
  })
  @ApiUuidParam('taskPlanId')
  @ApiZodBody(updateTaskSchema)
  @ApiEnvelope(taskPlanViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
  @ResponseMessage('Updated successfully')
  public update(
    @CurrentActor() actor: Actor,
    @Param('taskPlanId', new ZodValidationPipe(uuidParamSchema))
    taskPlanId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskBody,
  ): Promise<TaskPlanView> {
    return this.updateTask.execute(actor, taskPlanId, body);
  }

  @Post('task-plans/:taskPlanId/complete')
  @ApiOperation({ summary: 'Mark a task completed (A40)' })
  @ApiUuidParam('taskPlanId')
  @ApiEnvelope(taskPlanViewSchema, { message: 'Updated successfully' })
  @ApiErrors(400, 401, 404)
  @HttpCode(200)
  @ResponseMessage('Updated successfully')
  public complete(
    @CurrentActor() actor: Actor,
    @Param('taskPlanId', new ZodValidationPipe(uuidParamSchema))
    taskPlanId: string,
  ): Promise<TaskPlanView> {
    return this.completeTask.execute(actor, taskPlanId);
  }

  @Delete('task-plans/:taskPlanId')
  @ApiOperation({ summary: 'Delete a task (A41, hard delete)' })
  @ApiUuidParam('taskPlanId')
  @ApiEnvelope(null, { message: 'Deleted successfully' })
  @ApiErrors(400, 401, 404)
  @HttpCode(200)
  @ResponseMessage('Deleted successfully')
  public async remove(
    @CurrentActor() actor: Actor,
    @Param('taskPlanId', new ZodValidationPipe(uuidParamSchema))
    taskPlanId: string,
  ): Promise<null> {
    await this.deleteTask.execute(actor, taskPlanId);
    return null;
  }
}
