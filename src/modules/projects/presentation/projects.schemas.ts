import { z } from 'zod';

import { PROJECT_INSTRUCTIONS_MAX, PROJECT_NAME_MAX } from '../domain/project';

/** Schema request — validate hình dạng; invariant nghiệp vụ vẫn ở domain. */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX),
  description: z.string().max(5_000).nullish(),
  instructions: z.string().max(PROJECT_INSTRUCTIONS_MAX).nullish(),
});
export type CreateProjectBody = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
