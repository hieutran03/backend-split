import type { TaskPlan } from '../domain/task-plan';

/** Same values as conversations.plan_lifecycle (Python PlanLifecycle). */
export type PlanLifecycle =
  'draft' | 'ready' | 'executing' | 'paused' | 'completed';

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
  maxTaskOrder(conversationId: string): Promise<number>;
  insertMany(tasks: TaskPlan[]): Promise<void>;
  save(task: TaskPlan): Promise<void>;
  delete(taskPlanId: string): Promise<void>;
}
export const TASK_PLAN_REPOSITORY = Symbol('TASK_PLAN_REPOSITORY');
