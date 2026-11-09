import { z } from 'zod';

import { type ProjectView } from '../application/project.view';
import { PROJECT_INSTRUCTIONS_MAX, PROJECT_NAME_MAX } from '../domain/project';

// ------------------------------------------------------------------ request
/** Validate hình dạng request; invariant nghiệp vụ vẫn ở domain. Dùng chung cho Swagger. */
export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(PROJECT_NAME_MAX)
    .meta({ example: 'Báo cáo Q3' }),
  description: z.string().max(5_000).nullish(),
  instructions: z.string().max(PROJECT_INSTRUCTIONS_MAX).nullish().meta({
    description:
      'Đi vào body E1 (projectInstructions) cho mọi hội thoại của project',
    example: 'Trả lời ngắn gọn, bằng tiếng Việt',
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
 * Chỉ dùng cho tài liệu. Kiểu `z.ZodType<ProjectView>` bắt compiler báo lỗi nếu
 * ProjectView đổi mà schema này không đổi theo.
 */
export const projectViewSchema: z.ZodType<ProjectView> = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
