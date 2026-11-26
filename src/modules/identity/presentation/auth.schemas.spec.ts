import { z } from 'zod';

import { signupSchema } from './auth.schemas';

const base = { username: 'hieu', password: 'correct-horse-battery' };

describe('signupSchema email', () => {
  it('strips surrounding spaces like Python EmailStr', () => {
    const parsed = signupSchema.parse({
      ...base,
      email: '  Hieu@Example.COM ',
    });
    expect(parsed.email).toBe('Hieu@Example.COM');
  });

  it('still rejects a malformed address', () => {
    for (const email of [' not-an-email ', 'a @b.com', '   ']) {
      expect(signupSchema.safeParse({ ...base, email }).success).toBe(false);
    }
  });

  it('is still documented as an email string (same options as zodToOpenApi)', () => {
    const json = z.toJSONSchema(signupSchema, {
      target: 'openapi-3.0',
      io: 'input',
      unrepresentable: 'any',
    }) as { properties: Record<string, { type?: string; format?: string }> };
    expect(json.properties.email).toMatchObject({
      type: 'string',
      format: 'email',
    });
  });
});
