import { z } from 'zod';

import type {
  PlanningStatusView,
  TaskPlanView,
} from '../application/task-plan.use-cases';
import { TASK_STATUSES } from '../domain/task-plan';

/** A36 — at least one description; blank ones ⇒ 400 (Python: 500). */
export const addTasksSchema = z.object({
  taskDescriptions: z
    .array(z.string().trim().min(1, { message: 'must not be blank' }))
    .min(1),
});
export type AddTasksBody = z.infer<typeof addTasksSchema>;

/** A37 — `include_completed` renamed (S3). Default false, as in Python. */
export const listTasksQuerySchema = z.object({
  includeCompleted: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true')
    .meta({ description: 'Also return completed and skipped tasks' }),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

/**
 * A39 — `completedAt` is no longer accepted (derived from `status`); `null` for
 * description/status is rejected; `taskMetadata: null` clears it.
 */
export const updateTaskSchema = z
  .object({
    description: z.string().trim().min(1, { message: 'must not be blank' }),
    status: z.enum(TASK_STATUSES),
    taskMetadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;

const taskPlanViewObject = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  taskOrder: z.number().int(),
  description: z.string(),
  status: z.enum(TASK_STATUSES),
  taskMetadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export const taskPlanViewSchema: z.ZodType<TaskPlanView> = taskPlanViewObject;
export const taskPlanListSchema: z.ZodType<TaskPlanView[]> =
  z.array(taskPlanViewObject);

export const planningStatusSchema: z.ZodType<PlanningStatusView> = z.object({
  planningModeEnabled: z.boolean(),
  planLifecycle: z
    .enum(['draft', 'ready', 'executing', 'paused', 'completed'])
    .nullable(),
  totalTasks: z.number().int(),
  pendingTasks: z.number().int(),
  inProgressTasks: z.number().int(),
  completedTasks: z.number().int(),
  skippedTasks: z.number().int(),
  progressPercentage: z.number(),
  nextTask: taskPlanViewObject.nullable(),
});
