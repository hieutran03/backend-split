import { z } from 'zod';

import { paginationQuerySchema } from '@platform/http/pagination.query';
import type { MessageView } from '../application/message.view';

/**
 * `include=feedback` (A10/A20) needs the feedbacks table (FB-01). Until then it is
 * rejected instead of being silently ignored.
 */
const includeNotYetSupported = z
  .unknown()
  .optional()
  .refine((value) => value === undefined, {
    message: 'include is not supported yet',
  });

/** A10 — S2 pagination; `sort`: sequence | createdAt | updatedAt, default `-sequence`. */
export const listConversationMessagesQuerySchema = paginationQuerySchema.extend(
  { include: includeNotYetSupported },
);
export type ListConversationMessagesQuery = z.infer<
  typeof listConversationMessagesQuerySchema
>;

/** A20 — S2 pagination, default `-createdAt`; optional `conversationId` filter. */
export const listMessagesQuerySchema = paginationQuerySchema.extend({
  conversationId: z.uuid().optional(),
  include: includeNotYetSupported,
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
});
