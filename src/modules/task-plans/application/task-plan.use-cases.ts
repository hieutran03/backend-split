import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';
import { deriveLifecycle, LIFECYCLE_AFTER_ADD } from '../domain/plan-lifecycle';
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
 * TP-02: every task change writes conversations.plan_lifecycle back, exactly like
 * Python TaskPlanService (the Engine reads that column):
 *  - add (A36)                  => planning mode on + 'draft'
 *  - update / complete / delete => deriveLifecycle(all tasks of the conversation)
 * Each runs in one transaction with the conversation row locked (FOR UPDATE), so
 * two concurrent changes cannot write a lifecycle computed from a stale task list.
 */

/**
 * Recomputes the lifecycle from every task of the conversation (completed and
 * skipped included — Python `include_completed=True`).
 */
async function refreshLifecycle(
  tasks: TaskPlanRepository,
  conversationId: string,
  now: Date,
): Promise<void> {
  const all = await tasks.listForConversation(conversationId);
  await tasks.setPlanState(
    conversationId,
    {
      planLifecycle: deriveLifecycle(all.map((t) => t.snapshot().status)),
      enablePlanningMode: false,
    },
    now,
  );
}

/**
 * Loads a task the actor owns and locks its conversation row first, so the
 * lifecycle written afterwards sees every committed task change.
 */
async function lockOwnedTask(
  tasks: TaskPlanRepository,
  actorId: string,
  taskPlanId: string,
): Promise<TaskPlan> {
  const found = await tasks.findOwned(taskPlanId, actorId);
  if (!found) throw new NotFoundError('task_plan');
  if (!(await tasks.lockConversation(found.conversationId, actorId))) {
    throw new NotFoundError('task_plan');
  }
  // Re-read under the lock: another transaction may have changed or deleted it.
  const task = await tasks.findOwned(taskPlanId, actorId);
  if (!task) throw new NotFoundError('task_plan');
  return task;
}

/**
 * A36 — append tasks after the current last one (Python: "If a plan already exists,
 * new tasks are appended after the current last task"). The conversation row is
 * locked first so two concurrent appends cannot pick the same task_order.
 * The first task gets task_order 0 (Python `0 if max is None else max + 1`).
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
      const first = last === null ? 0 : last + 1;
      const now = this.clock.now();
      const created = descriptions.map((description, i) =>
        TaskPlan.add({
          id: this.ids.uuid(),
          conversationId,
          taskOrder: first + i,
          description,
          now,
        }),
      );
      await this.tasks.insertMany(created);
      await this.tasks.setPlanState(
        conversationId,
        { planLifecycle: LIFECYCLE_AFTER_ADD, enablePlanningMode: true },
        now,
      );
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
    private readonly transactions: TransactionManager,
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
    return this.transactions.run(async () => {
      const task = await lockOwnedTask(this.tasks, actor.userId, taskPlanId);
      const now = this.clock.now();
      task.update(
        {
          description: input.description,
          status: input.status,
          metadata: input.taskMetadata,
        },
        now,
      );
      await this.tasks.save(task);
      await refreshLifecycle(this.tasks, task.conversationId, now);
      return toTaskPlanView(task);
    });
  }
}

/** A40. */
export class CompleteTaskUseCase {
  public constructor(
    private readonly tasks: TaskPlanRepository,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public execute(actor: Actor, taskPlanId: string): Promise<TaskPlanView> {
    return this.transactions.run(async () => {
      const task = await lockOwnedTask(this.tasks, actor.userId, taskPlanId);
      const now = this.clock.now();
      task.complete(now);
      await this.tasks.save(task);
      await refreshLifecycle(this.tasks, task.conversationId, now);
      return toTaskPlanView(task);
    });
  }
}

/** A41 — still a hard delete; the remaining tasks keep their task_order (TC-50). */
export class DeleteTaskUseCase {
  public constructor(
    private readonly tasks: TaskPlanRepository,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  public execute(actor: Actor, taskPlanId: string): Promise<void> {
    return this.transactions.run(async () => {
      const task = await lockOwnedTask(this.tasks, actor.userId, taskPlanId);
      await this.tasks.delete(task.id);
      await refreshLifecycle(this.tasks, task.conversationId, this.clock.now());
    });
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

/**
 * A42 — `planLifecycle` is the stored value. Like Python `get_planning_status`,
 * reading the status turns planning mode on when the conversation has tasks but
 * the flag is off (a write inside a GET — TC-60).
 */
export class GetPlanningStatusUseCase {
  public constructor(
    private readonly tasks: TaskPlanRepository,
    private readonly clock: Clock,
  ) {}

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
    let planningModeEnabled = conversation.planningModeEnabled;
    if (!planningModeEnabled && progress.totalTasks > 0) {
      await this.tasks.setPlanState(
        conversationId,
        { planLifecycle: conversation.planLifecycle, enablePlanningMode: true },
        this.clock.now(),
      );
      planningModeEnabled = true;
    }
    return {
      planningModeEnabled,
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
