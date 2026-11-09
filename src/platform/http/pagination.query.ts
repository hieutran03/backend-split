import { z } from 'zod';

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@shared/pagination/page';

/** Query phân trang chuẩn (§4.1 S2): ?page=1&limit=20&sort=-updatedAt */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
  sort: z.string().max(64).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const uuidParamSchema = z.uuid({ message: 'must be a valid UUID' });
