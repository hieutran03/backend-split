import { z } from 'zod';

import { type ProjectView } from '../application/project.view';
import { PROJECT_INSTRUCTIONS_MAX, PROJECT_NAME_MAX } from '../domain/project';

// ------------------------------------------------------------------ request
/** Validates request shape; business invariants stay in the domain. Shared with Swagger. */
export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(PROJECT_NAME_MAX)
    .meta({ example: 'Q3 report' }),
  description: z.string().max(5_000).nullish(),
  instructions: z.string().max(PROJECT_INSTRUCTIONS_MAX).nullish().meta({
    description:
      'Goes into the E1 body (projectInstructions) for every conversation in the project',
    example: 'Answer briefly, in Vietnamese',
  }),
});
export type CreateProjectBody = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;

// ----------------------------------------------------------------- response
/**
 * Documentation only. The `z.ZodType<ProjectView>` type makes the compiler fail if
 * ProjectView changes without this schema changing too.
 */
export const projectViewSchema: z.ZodType<ProjectView> = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
