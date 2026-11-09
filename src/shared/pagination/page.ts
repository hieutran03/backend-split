/** New standard pagination (§4.1 S2): page starts at 1, limit defaults to 20, max 100. */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface PageRequest {
  readonly page: number;
  readonly limit: number;
  /** E.g. `-updatedAt` = updatedAt DESC. Each module whitelists its own sortable fields. */
  readonly sort?: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export function toPage<T>(
  items: readonly T[],
  total: number,
  req: PageRequest,
): Page<T> {
  return {
    items,
    meta: {
      page: req.page,
      limit: req.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / req.limit)),
    },
  };
}

export function mapPage<A, B>(page: Page<A>, fn: (a: A) => B): Page<B> {
  return { items: page.items.map(fn), meta: page.meta };
}

/** Parse `sort=-updatedAt` into {field, direction}; only whitelisted fields are accepted. */
export function parseSort<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: { field: F; direction: 'ASC' | 'DESC' },
): { field: F; direction: 'ASC' | 'DESC' } {
  if (!sort) return fallback;
  const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
  const field = sort.replace(/^[-+]/, '') as F;
  return allowed.includes(field) ? { field, direction } : fallback;
}
