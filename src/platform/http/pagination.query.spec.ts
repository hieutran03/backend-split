import { z } from 'zod';

import { paginationQuerySchema } from './pagination.query';

describe('paginationQuerySchema', () => {
  it('documents in OpenAPI that an unknown sort field falls back to the default order', () => {
    const json = z.toJSONSchema(paginationQuerySchema, {
      target: 'openapi-3.0',
      io: 'input',
      unrepresentable: 'any',
    }) as { properties: Record<string, { description?: string }> };
    expect(json.properties.sort?.description).toMatch(/default order/);
  });

  it('leaves sort optional and defaults page and limit', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });
});
