import { z } from 'zod';

import { paginationQuerySchema } from '@platform/http/pagination.query';
import {
  type ConversationListItemView,
  type ConversationView,
} from '../application/conversation.view';
import { PERSONA_PROMPT_MAX, TITLE_MAX } from '../domain/conversation';

// ------------------------------------------------------------------ request
/** A7 — mirrors Python `ConversationCreate`. */
export const createConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(TITLE_MAX)
    .meta({ example: 'Q3 planning' }),
  personaPrompt: z.string().max(PERSONA_PROMPT_MAX).nullish().meta({
    description: 'Custom persona/system instruction for this conversation',
  }),
  planningModeEnabled: z.boolean().optional(),
  projectId: z.uuid().nullish().meta({
    description: 'Must be one of your own, non-deleted projects (else 404)',
  }),
});
export type CreateConversationBody = z.infer<typeof createConversationSchema>;

/**
 * A11 — `title: null` is rejected (only a string is accepted), `personaPrompt: null`
 * clears the persona. At least one field is required.
 */
export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    personaPrompt: z.string().max(PERSONA_PROMPT_MAX).nullable(),
    planningModeEnabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateConversationBody = z.infer<typeof updateConversationSchema>;

/** A9: max latest messages per conversation (Python allowed up to 100). */
export const LATEST_MESSAGES_MAX = 20;

/**
 * `include` arrives as `include=messages` or repeated (`include=a&include=b`).
 * Only `messages` is accepted; `feedback` was silently ignored by Python and is
 * now rejected (A9).
 */
const includeSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(
    z.array(
      z.enum(['messages'], {
        message: "only 'messages' can be included",
      }),
    ),
  )
  .meta({ description: '`messages` adds the latest messages to each item' });

/** A9 — S2 pagination (`sort`: updatedAt | createdAt, `-` prefix = desc). */
export const listConversationsQuerySchema = paginationQuerySchema.extend({
  projectId: z.uuid().optional(),
  search: z.string().trim().min(1).max(200).optional().meta({
    description: 'Case-insensitive match on the title or a message content',
  }),
  include: includeSchema,
  latestMessages: z.coerce
    .number()
    .int()
    .min(0)
    .max(LATEST_MESSAGES_MAX)
    .default(3)
    .meta({ description: 'Messages per conversation with include=messages' }),
});
export type ListConversationsQuery = z.infer<
  typeof listConversationsQuerySchema
>;

// ----------------------------------------------------------------- response
const conversationViewObject = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string(),
  personaPrompt: z.string().nullable(),
  planningModeEnabled: z.boolean(),
  planLifecycle: z
    .enum(['draft', 'ready', 'executing', 'paused', 'completed'])
    .nullable(),
  projectId: z.uuid().nullable(),
  forkedFromConversationId: z.uuid().nullable(),
  forkedFromMessageId: z.uuid().nullable(),
  forkedThroughSequence: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export const conversationViewSchema: z.ZodType<ConversationView> =
  conversationViewObject;

const conversationMessageSchema = z.object({
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

export const conversationListItemSchema: z.ZodType<ConversationListItemView> =
  conversationViewObject.extend({
    messageCount: z.number().int(),
    messages: z.array(conversationMessageSchema).optional(),
  });
