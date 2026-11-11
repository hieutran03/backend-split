import { z } from 'zod';

import type { FeedbackView } from '../application/feedback.use-cases';
import { RATING_MAX, RATING_MIN } from '../domain/feedback';

const rating = z
  .number()
  .int()
  .min(RATING_MIN)
  .max(RATING_MAX)
  .meta({ description: `Rating from ${RATING_MIN} to ${RATING_MAX}` });

/** A30 — `messageId` comes from the path only (no longer in the body). */
export const createFeedbackSchema = z.object({
  rating,
  comment: z.string().nullish(),
});
export type CreateFeedbackBody = z.infer<typeof createFeedbackSchema>;

/** A34 — `rating: null` rejected; `comment: null` clears it; at least one field. */
export const updateFeedbackSchema = z
  .object({ rating, comment: z.string().nullable() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateFeedbackBody = z.infer<typeof updateFeedbackSchema>;

export const feedbackViewSchema: z.ZodType<FeedbackView> = z.object({
  id: z.uuid(),
  messageId: z.uuid(),
  userId: z.uuid(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
