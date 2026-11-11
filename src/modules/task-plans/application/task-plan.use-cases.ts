import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import { planProgress } from '../domain/planning-status';
import { TaskPlan, type TaskStatus } from '../domain/task-plan';
import type { PlanLifecycle, TaskPlanRepository } from './ports';

export interface TaskPlanView {
  readonly id: string;
  readonly conversationId: string;
  readonly taskOrder: number;
  readonly description: string;
  readonly status: TaskStatus;
  readonly taskMetadata: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

/** Field names follow Python `TaskPlanRead`. */
export function toTaskPlanView(t: TaskPlan): TaskPlanView {
  const p = t.snapshot();
  return {
    id: p.id,
    conversationId: p.conversationId,
    taskOrder: p.taskOrder,
    description: p.description,
    status: p.status,
    taskMetadata: p.metadata,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
  };
}

/*
 * NOTE: Python recomputes conversations.plan_lifecycle after every task change.
 * The rule is not in the spec and the Engine reads that column, so these use cases
 * do NOT write it until the rule is ported (TP-02, TC-48).
 */

/**
 * A36 — append tasks after the current last one (Python: "If a plan already exists,
 * new tasks are appended after the current last task"). The conversation row is
 * locked first so two concurrent appends cannot pick the same task_order.
 */
export class AddTasksUseCase {
  public constructor(
    private readonly tasks: TaskPlanRepository,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public execute(
    actor: Actor,
    conversationId: string,
    descriptions: readonly string[],
  ): Promise<TaskPlanView[]> {
    return this.transactions.run(async () => {
      const conversation = await this.tasks.lockConversation(
        conversationId,
        actor.userId,
      );
      if (!conversation) throw new NotFoundError('conversation');
      const last = await this.tasks.maxTaskOrder(conversationId);
      const now = this.clock.now();
      const created = descriptions.map((description, i) =>
        TaskPlan.add({
          id: this.ids.uuid(),
          conversationId,
          taskOrder: last + i + 1,
          description,
          now,
        }),
      );
      await this.tasks.insertMany(created);
      return created.map(toTaskPlanView);
    });
  }
}

/** A37 — ordered by task_order; completed and skipped hidden unless includeCompleted. */
export class ListTasksUseCase {
  public constructor(private readonly tasks: TaskPlanRepository) {}

  public async execute(
    actor: Actor,
    conversationId: string,
    includeCompleted: boolean,
  ): Promise<TaskPlanView[]> {
    if (!(await this.tasks.findConversation(conversationId, actor.userId))) {
      throw new NotFoundError('conversation');
    }
    const all = await this.tasks.listForConversation(conversationId);
    return all
      .filter((t) => {
        const status = t.snapshot().status;
        return (
          includeCompleted || (status !== 'completed' && status !== 'skipped')
        );
      })
      .map(toTaskPlanView);
  }
}

/** A38. */
export class GetTaskUseCase {
  public constructor(private readonly tasks: TaskPlanRepository) {}

  public async execute(
    actor: Actor,
    taskPlanId: string,
  ): Promise<TaskPlanView> {
    const task = await this.tasks.findOwned(taskPlanId, actor.userId);
    if (!task) throw new NotFoundError('task_plan');
    return toTaskPlanView(task);
  }
}

/** A39 — description / status / metadata; `completedAt` derived from `status`. */
export class UpdateTaskUseCase {
  public constructor(
    private readonly tasks: TaskPlanRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Actor,
    taskPlanId: string,
    input: {
      description?: string | undefined;
      status?: TaskStatus | undefined;
      taskMetadata?: Record<string, unknown> | null | undefined;
    },
  ): Promise<TaskPlanView> {
    const task = await this.tasks.findOwned(taskPlanId, actor.userId);
    if (!task) throw new NotFoundError('task_plan');
    task.update(
      {
        description: input.description,
        status: input.status,
        metadata: input.taskMetadata,
      },
      this.clock.now(),
    );
    await this.tasks.save(task);
    return toTaskPlanView(task);
  }
}

/** A40. */
export class CompleteTaskUseCase {
  public constructor(
    private readonly tasks: TaskPlanRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Actor,
    taskPlanId: string,
  ): Promise<TaskPlanView> {
    const task = await this.tasks.findOwned(taskPlanId, actor.userId);
    if (!task) throw new NotFoundError('task_plan');
    task.complete(this.clock.now());
    await this.tasks.save(task);
    return toTaskPlanView(task);
  }
}

/** A41 — still a hard delete; the remaining tasks keep their task_order (TC-50). */
export class DeleteTaskUseCase {
  public constructor(private readonly tasks: TaskPlanRepository) {}

  public async execute(actor: Actor, taskPlanId: string): Promise<void> {
    const task = await this.tasks.findOwned(taskPlanId, actor.userId);
    if (!task) throw new NotFoundError('task_plan');
    await this.tasks.delete(task.id);
  }
}

export interface PlanningStatusView {
  readonly planningModeEnabled: boolean;
  readonly planLifecycle: PlanLifecycle | null;
  readonly totalTasks: number;
  readonly pendingTasks: number;
  readonly inProgressTasks: number;
  readonly completedTasks: number;
  readonly skippedTasks: number;
  readonly progressPercentage: number;
  readonly nextTask: TaskPlanView | null;
}

/** A42 — `planLifecycle` is the stored value (see the NOTE above). */
export class GetPlanningStatusUseCase {
  public constructor(private readonly tasks: TaskPlanRepository) {}

  public async execute(
    actor: Actor,
    conversationId: string,
  ): Promise<PlanningStatusView> {
    const conversation = await this.tasks.findConversation(
      conversationId,
      actor.userId,
    );
    if (!conversation) throw new NotFoundError('conversation');
    const progress = planProgress(
      await this.tasks.listForConversation(conversationId),
    );
    return {
      planningModeEnabled: conversation.planningModeEnabled,
      planLifecycle: conversation.planLifecycle,
      totalTasks: progress.totalTasks,
      pendingTasks: progress.pendingTasks,
      inProgressTasks: progress.inProgressTasks,
      completedTasks: progress.completedTasks,
      skippedTasks: progress.skippedTasks,
      progressPercentage: progress.progressPercentage,
      nextTask: progress.nextTask ? toTaskPlanView(progress.nextTask) : null,
    };
  }
}
