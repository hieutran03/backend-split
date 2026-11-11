import type { TaskPlan } from './task-plan';

export interface PlanProgress {
  readonly totalTasks: number;
  readonly pendingTasks: number;
  readonly inProgressTasks: number;
  readonly completedTasks: number;
  readonly skippedTasks: number;
  readonly progressPercentage: number;
  readonly nextTask: TaskPlan | null;
}

/**
 * A42 counts. Counting per status is unambiguous; two rules are PROVISIONAL
 * because the Python implementation is not in the spec (TC-49):
 *  - progressPercentage = completed / total × 100, rounded to 2 decimals (0 when empty);
 *  - nextTask = the first in_progress task by task_order, else the first pending one.
 * Read-only: nothing here is persisted.
 */
export function planProgress(tasks: readonly TaskPlan[]): PlanProgress {
  const ordered = [...tasks].sort(
    (a, b) => a.snapshot().taskOrder - b.snapshot().taskOrder,
  );
  const count = (status: string): number =>
    ordered.filter((t) => t.snapshot().status === status).length;
  const total = ordered.length;
  const completed = count('completed');
  const next =
    ordered.find((t) => t.snapshot().status === 'in_progress') ??
    ordered.find((t) => t.snapshot().status === 'pending') ??
    null;
  return {
    totalTasks: total,
    pendingTasks: count('pending'),
    inProgressTasks: count('in_progress'),
    completedTasks: completed,
    skippedTasks: count('skipped'),
    progressPercentage:
      total === 0 ? 0 : Math.round((completed / total) * 10000) / 100,
    nextTask: next,
  };
}
