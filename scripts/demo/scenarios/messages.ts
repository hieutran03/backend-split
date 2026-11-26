import type { DemoContext, Scenario } from '../context';
import type { Json } from '../kit';
import { ensureUsers, seedChat } from './fixtures';

const PRIVATE_URL = 'https://origin.example.com/private/raw.png';

export const messagesScenario: Scenario = {
  id: 'messages',
  title: 'Read messages, UIMessage projection',
  tasks: 'MSG-01, MSG-02',
  apis: 'A10, A19, A20, A26 → A10 ?format=ui-message',
  journal: 'docs/journal/012, 020',
  summary:
    '`sender` is stored as 1/2 and returned as user/assistant; default order -sequence; `format=ui-message` is the port of Python ai_sdk_projection (parts, scrubbed metadata, private image URLs redacted).',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);
    const chat = await seedChat(ctx, alice, 'Messages demo');
    const [m1, m2, , m4] = chat.messages;
    const path = `/conversations/${chat.conversationId}/messages`;

    ctx.step(
      'List the messages of the conversation (A10)',
      'Default sort -sequence (TC-39): newest first.',
    );
    let res = await api.get(path, { as: alice });
    ctx.expect(res, 200);
    ctx.equal(
      'sequences',
      (res.data?.items ?? []).map((m: Json) => m.sequence),
      [4, 3, 2, 1],
    );
    ctx.equal(
      'senders',
      (res.data?.items ?? []).map((m: Json) => m.sender),
      ['assistant', 'user', 'assistant', 'user'],
    );

    ctx.step('Same list, oldest first, 2 per page (A10)');
    res = await api.get(path, {
      as: alice,
      query: { sort: 'sequence', page: 2, limit: 2 },
    });
    ctx.expect(res, 200);
    ctx.equal(
      'page 2 sequences',
      (res.data?.items ?? []).map((m: Json) => m.sequence),
      [3, 4],
    );
    ctx.equal('meta', res.data?.meta, {
      page: 2,
      limit: 2,
      total: 4,
      totalPages: 2,
    });

    ctx.step(
      'Sort by a field that is not sortable (A10)',
      'Each module whitelists its sort fields; an unknown one is ignored and the default -sequence applies (not a 400).',
    );
    res = await api.get(path, { as: alice, query: { sort: 'content' } });
    ctx.expect(res, 200);
    ctx.equal(
      'default order kept',
      (res.data?.items ?? []).map((m: Json) => m.sequence),
      [4, 3, 2, 1],
    );

    ctx.step('One message (A19), and bob asks for it');
    res = await api.get(`/messages/${m1.id}`, { as: alice });
    ctx.expect(res, 200);
    ctx.equal('sender', res.data?.sender, 'user');
    res = await api.get(`/messages/${m1.id}`, { as: bob });
    ctx.expect(res, 404, 'message_not_found');

    ctx.step(
      'All my messages in one conversation (A20)',
      'Default sort -createdAt.',
    );
    res = await api.get('/messages', {
      as: alice,
      query: { conversationId: chat.conversationId, limit: 3 },
    });
    ctx.expect(res, 200);
    ctx.equal('first item is the newest', res.data?.items?.[0]?.id, m4.id);
    ctx.equal('total', res.data?.meta?.total, 4);

    ctx.step(
      'UIMessage projection for the AI SDK (A10 ?format=ui-message, MSG-02)',
      'Same page as A10, mapped to { id, role, content, parts, metadata, createdAt }.',
    );
    res = await api.get(path, {
      as: alice,
      query: { format: 'ui-message', sort: 'sequence' },
    });
    ctx.expect(res, 200);
    const ui: Json[] = res.data?.items ?? [];
    const [u1, u2, , u4] = ui;
    ctx.equal(
      'roles',
      ui.map((m) => m.role),
      ['user', 'assistant', 'user', 'assistant'],
    );
    ctx.equal(
      'user metadata keeps persona + context_window only',
      Object.keys(u1?.metadata ?? {}).sort(),
      ['context_window', 'persona'],
    );
    ctx.equal('legacy images become file parts', u2?.parts, [
      { type: 'text', text: m2.content },
      {
        type: 'file',
        url: 'https://cdn.example.com/my-khe.png',
        mediaType: 'image/png',
      },
    ]);
    ctx.equal('images / images_count removed from metadata', u2?.metadata, {});
    ctx.check(
      'the private original image URL appears nowhere',
      !JSON.stringify(u4).includes(PRIVATE_URL),
    );
    ctx.equal('rich image item → file part', u4?.parts?.[1], {
      type: 'file',
      url: '/web-images/9',
      mediaType: 'image/png',
    });

    ctx.step(
      'Same projection with inlineRichResponseV1=true (client capability flag)',
    );
    res = await api.get(path, {
      as: alice,
      query: {
        format: 'ui-message',
        sort: 'sequence',
        inlineRichResponseV1: 'true',
      },
    });
    ctx.expect(res, 200);
    ctx.check(
      'still no private URL',
      !JSON.stringify(res.body).includes(PRIVATE_URL),
    );

    ctx.step('format=ui-message together with include=feedback (A10)');
    res = await api.get(path, {
      as: alice,
      query: { format: 'ui-message', include: 'feedback' },
    });
    ctx.expectInvalid(res, 'include');
  },
};

export const feedbackScenario: Scenario = {
  id: 'feedback',
  title: 'Feedback on a message',
  tasks: 'FB-01',
  apis: 'A30, A32–A34 (A31 removed)',
  journal: 'docs/journal/014',
  summary:
    'One feedback per message, rating 1–5, addressed by the message; ownership goes through the message’s conversation; include=feedback on the message lists.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);
    const chat = await seedChat(ctx, alice, 'Feedback demo');
    const [, m2, , m4] = chat.messages;
    const path = `/messages/${m2.id}/feedback`;

    ctx.step('No feedback yet (A32)');
    let res = await api.get(path, { as: alice });
    ctx.expect(res, 404, 'feedback_not_found');

    ctx.step('Rate the assistant answer 5/5 (A30)');
    res = await api.post(path, {
      as: alice,
      body: { rating: 5, comment: 'Great itinerary' },
    });
    ctx.expect(res, 201);
    ctx.equal('rating', res.data?.rating, 5);

    ctx.step(
      'Rate it a second time (A30)',
      'Create only ⇒ 409; change it with PATCH.',
    );
    res = await api.post(path, { as: alice, body: { rating: 1 } });
    ctx.expect(res, 409, 'feedback_exists');

    ctx.step('Rating out of range (A30)');
    res = await api.post(`/messages/${m4.id}/feedback`, {
      as: alice,
      body: { rating: 6 },
    });
    ctx.expectInvalid(res, 'rating');

    ctx.step(
      'bob rates alice’s message (A30)',
      'Ownership goes through the message ⇒ 404, the message is invisible to bob.',
    );
    res = await api.post(path, { as: bob, body: { rating: 1 } });
    ctx.expect(res, 404, 'message_not_found');

    ctx.step('Update: rating 4, clear the comment (A34)');
    res = await api.patch(path, {
      as: alice,
      body: { rating: 4, comment: null },
    });
    ctx.expect(res, 200);
    ctx.equal('rating', res.data?.rating, 4);
    ctx.equal('comment', res.data?.comment, null);

    ctx.step('`rating: null` is rejected (A34)');
    res = await api.patch(path, { as: alice, body: { rating: null } });
    ctx.expectInvalid(res, 'rating');

    ctx.step('Read it back (A33)');
    res = await api.get(path, { as: alice });
    ctx.expect(res, 200);
    ctx.equal('rating', res.data?.rating, 4);

    ctx.step(
      'Messages with include=feedback (A10)',
      'Each message carries my feedback, or null.',
    );
    res = await api.get(`/conversations/${chat.conversationId}/messages`, {
      as: alice,
      query: { include: 'feedback', sort: 'sequence' },
    });
    ctx.expect(res, 200);
    ctx.equal(
      'feedback ratings by sequence',
      (res.data?.items ?? []).map((m: Json) => m.feedback?.rating ?? null),
      [null, 4, null, null],
    );
  },
};
