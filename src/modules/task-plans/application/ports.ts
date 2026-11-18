import type { PlanLifecycle } from '../domain/plan-lifecycle';
import type { TaskPlan } from '../domain/task-plan';

export type { PlanLifecycle } from '../domain/plan-lifecycle';

/**
 * What a task change writes back to the conversation row (TP-02). Like Python,
 * `planningModeEnabled: true` only ever turns the flag on.
 */
export interface PlanStateChange {
  readonly planLifecycle: PlanLifecycle | null;
  readonly enablePlanningMode: boolean;
}

/** The conversation a plan belongs to, as this context needs it. */
export interface PlanConversation {
  readonly id: string;
  readonly planningModeEnabled: boolean;
  readonly planLifecycle: PlanLifecycle | null;
}

/**
 * Ownership is the conversation's owner; conversations are read by table name
 * (read-only, TC-35). Deleted conversations hide their tasks (404).
 */
export interface TaskPlanRepository {
  findConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null>;
  /**
   * Same, with a row lock (FOR UPDATE) on the conversation, so concurrent appends
   * to one plan are serialized. Inside TransactionManager.run() only.
   */
  lockConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<PlanConversation | null>;
  /** A task of a live conversation owned by `ownerId`. */
  findOwned(taskPlanId: string, ownerId: string): Promise<TaskPlan | null>;
  listForConversation(conversationId: string): Promise<TaskPlan[]>;
  /** Highest task_order of the conversation, null when it has no task. */
  maxTaskOrder(conversationId: string): Promise<number | null>;
  insertMany(tasks: TaskPlan[]): Promise<void>;
  save(task: TaskPlan): Promise<void>;
  delete(taskPlanId: string): Promise<void>;
  /**
   * Writes `conversations.plan_lifecycle` (and turns planning mode on when asked).
   * `updated_at` moves only when a value actually changes — Python writes through
   * the ORM, which skips an UPDATE for unchanged attributes.
   */
  setPlanState(
    conversationId: string,
    change: PlanStateChange,
    now: Date,
  ): Promise<void>;
}
export const TASK_PLAN_REPOSITORY = Symbol('TASK_PLAN_REPOSITORY');
