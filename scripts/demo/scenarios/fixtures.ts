import { randomUUID } from 'node:crypto';

import type { DemoContext, UserSession } from '../context';
import type { Caller, Json } from '../kit';

export const ALICE = {
  username: 'alice',
  /** Mixed case on purpose: the domain is lower-cased, the local part is kept (TC-17). */
  email: 'Alice.Demo@Example.COM',
  normalizedEmail: 'Alice.Demo@example.com',
  password: 'correct-horse-battery-1',
} as const;

export const BOB = {
  username: 'bob',
  email: 'bob@example.com',
  normalizedEmail: 'bob@example.com',
  password: 'correct-horse-battery-2',
} as const;

export async function login(
  ctx: DemoContext,
  label: string,
  email: string,
  password: string,
): Promise<UserSession> {
  const res = await ctx.api.post('/auth/login', { body: { email, password } });
  ctx.expect(res, 200);
  const data: Json = res.data;
  return {
    label,
    token: String(data.accessToken),
    refreshToken: String(data.refreshToken),
    userId: String(data.userId),
    email,
    password,
  };
}

/** Signs up and logs in alice and bob, unless the `auth` scenario already did. */
export async function ensureUsers(
  ctx: DemoContext,
): Promise<{ alice: UserSession; bob: UserSession }> {
  if (!ctx.state.alice || !ctx.state.bob) {
    ctx.step(
      'Setup: sign up and log in alice and bob',
      'Two users, so every scenario can show that another user’s data answers 404.',
    );
    for (const user of [ALICE, BOB]) {
      const res = await ctx.api.post('/auth/signup', {
        body: {
          username: user.username,
          email: user.email,
          password: user.password,
        },
      });
      ctx.check(
        `signup ${user.username}`,
        res.status === 201 || res.reason === 'email_not_available',
      );
    }
    ctx.state.alice = await login(ctx, 'alice', ALICE.email, ALICE.password);
    ctx.state.bob = await login(ctx, 'bob', BOB.email, BOB.password);
  }
  return { alice: ctx.state.alice, bob: ctx.state.bob };
}

export async function createConversation(
  ctx: DemoContext,
  as: Caller,
  body: Record<string, unknown>,
): Promise<Json> {
  const res = await ctx.api.post('/conversations', { as, body });
  ctx.expect(res, 201);
  return res.data;
}

export interface SeededMessage {
  readonly id: string;
  readonly sender: 'user' | 'assistant';
  readonly sequence: number;
  readonly content: string;
}

export interface SeededChat {
  readonly conversationId: string;
  readonly messages: readonly [
    SeededMessage,
    SeededMessage,
    SeededMessage,
    SeededMessage,
  ];
}

/**
 * Messages are written by chat turns (generations, W4), which do not exist yet, so the
 * demo inserts them straight into the backend database — the shape a finished turn
 * leaves behind: `sender` 1 = user / 2 = assistant, `sequence` from 1, metadata as Python
 * stores it (the second and fourth carry keys the read API must scrub).
 */
export async function seedChat(
  ctx: DemoContext,
  owner: UserSession,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<SeededChat> {
  const conversation = await createConversation(ctx, owner, {
    title,
    ...extra,
  });
  const conversationId = String(conversation.id);
  const rows = [
    {
      sender: 1,
      content: 'Plan a 3-day trip to Da Nang in March',
      metadata: {
        persona: 'travel agent',
        _internal: 1,
        conversation_id: conversationId,
        context_window: { limit: 1000, used: 10, ratio: 0.01 },
      },
    },
    {
      sender: 2,
      content:
        'Here is a 3-day itinerary: day 1 beaches, day 2 Ba Na Hills, day 3 Hoi An.',
      metadata: {
        images: [{ url: 'https://cdn.example.com/my-khe.png' }],
        images_count: 1,
      },
    },
    {
      sender: 1,
      content: 'Add a budget for each day',
      metadata: {},
    },
    {
      sender: 2,
      content: 'Budget per day: about 1.5 million VND.',
      metadata: {
        rich_items_version: 1,
        rich_items: [
          {
            id: 'img1',
            type: 'image',
            payload: {
              url: '/web-images/9',
              original_image_url: 'https://origin.example.com/private/raw.png',
            },
          },
        ],
        tool_output:
          '{"original_image_url": "https://origin.example.com/private/raw.png", "k": [1, 2]}',
        mention: 'see https://origin.example.com/private/raw.png',
      },
    },
  ];
  const values: unknown[] = [];
  const tuples = rows.map((row, i) => {
    const base = i * 6;
    values.push(
      randomUUID(),
      conversationId,
      row.sender,
      row.content,
      JSON.stringify(row.metadata),
      i + 1,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6}, now() + interval '${i} second', now() + interval '${i} second')`;
  });
  const inserted = await ctx.sql(
    'seed 4 messages (no message-writing API before W4)',
    `INSERT INTO messages (id, conversation_id, sender, content, message_metadata, sequence, created_at, updated_at)
     VALUES ${tuples.join(',\n            ')}
     RETURNING id, sender, sequence, content`,
    values,
  );
  const messages = inserted.map((row: Json): SeededMessage => ({
    id: String(row.id),
    sender: Number(row.sender) === 1 ? 'user' : 'assistant',
    sequence: Number(row.sequence),
    content: String(row.content),
  }));
  const [m1, m2, m3, m4] = messages;
  if (!m1 || !m2 || !m3 || !m4) throw new Error('seeding messages failed');
  return { conversationId, messages: [m1, m2, m3, m4] };
}
