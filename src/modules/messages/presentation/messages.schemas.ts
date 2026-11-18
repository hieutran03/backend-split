import { z } from 'zod';

import { paginationQuerySchema } from '@platform/http/pagination.query';
import type { MessageView } from '../application/message.view';

/** `include=feedback` (A10/A20), single or repeated; any other value ⇒ 400. */
const includeSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(
    z.array(
      z.enum(['feedback'], { message: "only 'feedback' can be included" }),
    ),
  )
  .meta({ description: '`feedback` adds my feedback to each message' });

/** FastAPI bool query parsing: true/false, 1/0, yes/no, on/off (case-insensitive). */
const queryFlag = z
  .string()
  .toLowerCase()
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off']))
  .transform((v) => ['true', '1', 'yes', 'on'].includes(v))
  .optional();

/**
 * A10 — S2 pagination; `sort`: sequence | createdAt | updatedAt, default `-sequence`.
 * `format=ui-message` (MSG-02, replaces A26) returns AI SDK UIMessages; the
 * capability flags exist in camelCase and, like Python, snake_case.
 */
export const listConversationMessagesQuerySchema = paginationQuerySchema
  .extend({
    include: includeSchema,
    format: z.enum(['ui-message']).optional().meta({
      description:
        '`ui-message` returns Vercel AI SDK UIMessages (`id, role, content, parts, metadata, createdAt`)',
    }),
    inlineRichResponseV1: queryFlag,
    inline_rich_response_v1: queryFlag,
    answerVisualsV1: queryFlag,
    answer_visuals_v1: queryFlag,
    sourceFiguresV1: queryFlag,
    source_figures_v1: queryFlag,
  })
  .refine((q) => q.format === undefined || q.include.length === 0, {
    path: ['include'],
    message: 'include is not supported with format=ui-message',
  });
export type ListConversationMessagesQuery = z.infer<
  typeof listConversationMessagesQuerySchema
>;

/** A20 — S2 pagination, default `-createdAt`; optional `conversationId` filter. */
export const listMessagesQuerySchema = paginationQuerySchema.extend({
  conversationId: z.uuid().optional(),
  include: includeSchema,
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const messageViewSchema: z.ZodType<MessageView> = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  sender: z.enum(['user', 'assistant']),
  content: z.string(),
  messageMetadata: z.record(z.string(), z.unknown()).nullable(),
  sequence: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  feedback: z
    .object({
      id: z.uuid(),
      messageId: z.uuid(),
      userId: z.uuid(),
      rating: z.number().int(),
      comment: z.string().nullable(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      deletedAt: z.iso.datetime().nullable(),
    })
    .nullable()
    .optional(),
});
