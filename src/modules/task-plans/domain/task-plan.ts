import { ValidationError } from '@shared/errors/app-error';

/** `task_status` Postgres enum (§6). */
export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'skipped',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskPlanProps {
  readonly id: string;
  readonly conversationId: string;
  readonly taskOrder: number;
  description: string;
  status: TaskStatus;
  metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/**
 * One task of a conversation's plan — `task_plans` table (§6). A39: `completedAt`
 * is derived from `status` (set when it becomes completed, cleared when it leaves
 * completed); clients cannot set it.
 */
export class TaskPlan {
  private constructor(private readonly props: TaskPlanProps) {}

  public static add(input: {
    id: string;
    conversationId: string;
    taskOrder: number;
    description: string;
    now: Date;
  }): TaskPlan {
    return new TaskPlan({
      id: input.id,
      conversationId: input.conversationId,
      taskOrder: input.taskOrder,
      description: TaskPlan.validDescription(input.description),
      status: 'pending',
      metadata: null,
      createdAt: input.now,
      updatedAt: input.now,
      completedAt: null,
    });
  }

  public static restore(props: TaskPlanProps): TaskPlan {
    return new TaskPlan({ ...props });
  }

  public get id(): string {
    return this.props.id;
  }

  public get conversationId(): string {
    return this.props.conversationId;
  }

  /** `undefined` = leave unchanged; `metadata: null` clears it. */
  public update(
    changes: {
      description?: string;
      status?: TaskStatus;
      metadata?: Record<string, unknown> | null;
    },
    now: Date,
  ): void {
    if (changes.description !== undefined) {
      this.props.description = TaskPlan.validDescription(changes.description);
    }
    if (changes.metadata !== undefined) this.props.metadata = changes.metadata;
    if (changes.status !== undefined) this.changeStatus(changes.status, now);
    this.props.updatedAt = now;
  }

  /** A40. Completing an already completed task keeps its original completedAt. */
  public complete(now: Date): void {
    this.changeStatus('completed', now);
    this.props.updatedAt = now;
  }

  public snapshot(): Readonly<TaskPlanProps> {
    return { ...this.props };
  }

  private changeStatus(status: TaskStatus, now: Date): void {
    if (status === 'completed') {
      if (this.props.status !== 'completed') this.props.completedAt = now;
    } else {
      this.props.completedAt = null;
    }
    this.props.status = status;
  }

  /** A36: blank descriptions ⇒ 400 (Python: 500). */
  private static validDescription(description: string): string {
    const trimmed = description.trim();
    if (trimmed.length === 0) {
      throw new ValidationError([
        { field: 'description', message: 'must not be blank' },
      ]);
    }
    return trimmed;
  }
}
