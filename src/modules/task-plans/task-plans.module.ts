import { Module } from '@nestjs/common';

import { DbContext } from '@platform/database/db-context';
import {
  CLOCK,
  ID_GENERATOR,
  type Clock,
  type IdGenerator,
} from '@platform/ports/kernel.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '@platform/ports/transaction-manager.port';
import {
  TASK_PLAN_REPOSITORY,
  type TaskPlanRepository,
} from './application/ports';
import {
  AddTasksUseCase,
  CompleteTaskUseCase,
  DeleteTaskUseCase,
  GetPlanningStatusUseCase,
  GetTaskUseCase,
  ListTasksUseCase,
  UpdateTaskUseCase,
} from './application/task-plan.use-cases';
import { TypeOrmTaskPlanRepository } from './infrastructure/typeorm-task-plan.repository';
import { TaskPlansController } from './presentation/task-plans.controller';

/** Task plans context (TP-*): manual CRUD + planning status. */
@Module({
  controllers: [TaskPlansController],
  providers: [
    {
      provide: TASK_PLAN_REPOSITORY,
      useFactory: (db: DbContext): TaskPlanRepository =>
        new TypeOrmTaskPlanRepository(db),
      inject: [DbContext],
    },
    {
      provide: AddTasksUseCase,
      useFactory: (
        repo: TaskPlanRepository,
        tx: TransactionManager,
        clock: Clock,
        ids: IdGenerator,
      ) => new AddTasksUseCase(repo, tx, clock, ids),
      inject: [TASK_PLAN_REPOSITORY, TRANSACTION_MANAGER, CLOCK, ID_GENERATOR],
    },
    {
      provide: ListTasksUseCase,
      useFactory: (repo: TaskPlanRepository) => new ListTasksUseCase(repo),
      inject: [TASK_PLAN_REPOSITORY],
    },
    {
      provide: GetTaskUseCase,
      useFactory: (repo: TaskPlanRepository) => new GetTaskUseCase(repo),
      inject: [TASK_PLAN_REPOSITORY],
    },
    {
      provide: UpdateTaskUseCase,
      useFactory: (repo: TaskPlanRepository, clock: Clock) =>
        new UpdateTaskUseCase(repo, clock),
      inject: [TASK_PLAN_REPOSITORY, CLOCK],
    },
    {
      provide: CompleteTaskUseCase,
      useFactory: (repo: TaskPlanRepository, clock: Clock) =>
        new CompleteTaskUseCase(repo, clock),
      inject: [TASK_PLAN_REPOSITORY, CLOCK],
    },
    {
      provide: DeleteTaskUseCase,
      useFactory: (repo: TaskPlanRepository) => new DeleteTaskUseCase(repo),
      inject: [TASK_PLAN_REPOSITORY],
    },
    {
      provide: GetPlanningStatusUseCase,
      useFactory: (repo: TaskPlanRepository) =>
        new GetPlanningStatusUseCase(repo),
      inject: [TASK_PLAN_REPOSITORY],
    },
  ],
})
export class TaskPlansModule {}
