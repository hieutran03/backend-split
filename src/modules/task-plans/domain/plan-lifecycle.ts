import type { TaskStatus } from './task-plan';

/**
 * `conversations.plan_lifecycle` values (Python `PlanLifecycle`, VARCHAR(20)).
 * NULL means "no plan". The Engine reads this column, so the rules below are a
 * port of Python `TaskPlanService`, not a design of our own (TP-02).
 */
export const PLAN_LIFECYCLES = [
  'draft',
  'ready',
  'executing',
  'paused',
  'completed',
] as const;
export type PlanLifecycle = (typeof PLAN_LIFECYCLES)[number];

/**
 * Python `_derive_lifecycle_from_tasks`, run after a task is updated, completed
 * or deleted:
 *  - no tasks                                   ⇒ null
 *  - every task completed or skipped            ⇒ 'completed'
 *  - any task in_progress, completed or skipped ⇒ 'executing'
 *  - otherwise (all pending)                    ⇒ 'draft'
 * 'ready' and 'paused' are only set by the Engine's planning workflow.
 */
export function deriveLifecycle(
  statuses: readonly TaskStatus[],
): PlanLifecycle | null {
  if (statuses.length === 0) return null;
  if (statuses.every((s) => s === 'completed' || s === 'skipped')) {
    return 'completed';
  }
  if (statuses.some((s) => s !== 'pending')) return 'executing';
  return 'draft';
}

/**
 * Python `create_task_plan_from_list` (A36): adding tasks by hand turns planning
 * mode on and resets the lifecycle to 'draft', whatever it was before.
 */
export const LIFECYCLE_AFTER_ADD: PlanLifecycle = 'draft';
