import { randomUUID } from 'node:crypto';

import type { DemoContext, Scenario } from '../context';
import type { Json } from '../kit';
import { createConversation, ensureUsers, seedChat } from './fixtures';

export const conversationsScenario: Scenario = {
  id: 'conversations',
  title: 'Conversations CRUD',
  tasks: 'CONV-01',
  apis: 'A7, A8, A9, A11 (A21–A24 fold into these)',
  journal: 'docs/journal/010',
  summary:
    'Create (optionally inside one of my projects), read, rename, clear the persona; another user’s conversation answers 404.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);

    ctx.step('Create a conversation with a persona (A7)');
    let res = await api.post('/conversations', {
      as: alice,
      body: {
        title: '  Weekly sync  ',
        personaPrompt: 'You are a concise assistant',
        planningModeEnabled: false,
      },
    });
    ctx.expect(res, 201);
    const id = String(res.data?.id);
    ctx.equal('title is trimmed', res.data?.title, 'Weekly sync');
    ctx.equal('planLifecycle', res.data?.planLifecycle, null);

    ctx.step('Create inside a project that is not mine (A7)');
    res = await api.post('/projects', { as: bob, body: { name: 'Bob only' } });
    ctx.expect(res, 201);
    res = await api.post('/conversations', {
      as: alice,
      body: { title: 'x', projectId: String(res.data?.id) },
    });
    ctx.expect(res, 404, 'project_not_found');

    ctx.step('Read it (A8), and bob reads it');
    res = await api.get(`/conversations/${id}`, { as: alice });
    ctx.expect(res, 200);
    res = await api.get(`/conversations/${id}`, { as: bob });
    ctx.expect(res, 404, 'conversation_not_found');

    ctx.step(
      'Rename and clear the persona (A11)',
      '`personaPrompt: null` clears it.',
    );
    res = await api.patch(`/conversations/${id}`, {
      as: alice,
      body: { title: 'Weekly sync (team)', personaPrompt: null },
    });
    ctx.expect(res, 200);
    ctx.equal('title', res.data?.title, 'Weekly sync (team)');
    ctx.equal('personaPrompt', res.data?.personaPrompt, null);

    ctx.step('`title: null` is rejected (A11)');
    res = await api.patch(`/conversations/${id}`, {
      as: alice,
      body: { title: null },
    });
    ctx.expectInvalid(res, 'title');

    ctx.step('bob renames alice’s conversation (A11)');
    res = await api.patch(`/conversations/${id}`, {
      as: bob,
      body: { title: 'hijacked' },
    });
    ctx.expect(res, 404, 'conversation_not_found');
  },
};

export const conversationListScenario: Scenario = {
  id: 'conversation-list',
  title: 'Conversation list: pagination, search, latest messages',
  tasks: 'CONV-01, CONV-04, SYNC-02',
  apis: 'A9',
  journal: 'docs/journal/010, 013, 019',
  summary:
    'Search matches titles and message contents and orders by relevance like Python (exact title, prefix, contains, message match); include=messages adds the latest N messages, oldest first.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);

    ctx.step(
      'Setup: 3 conversations about budgets + one chat whose MESSAGE mentions a budget',
    );
    const chat = await seedChat(ctx, alice, 'Trip planning');
    for (const title of ['Team budget', 'Budget review', 'Budget']) {
      await createConversation(ctx, alice, { title });
    }

    ctx.step(
      'Search "budget" (A9)',
      'Order: exact title, title prefix, title contains, message match, then newest (sort is ignored).',
    );
    let res = await api.get('/conversations', {
      as: alice,
      query: { search: 'budget' },
    });
    ctx.expect(res, 200);
    ctx.equal(
      'titles in relevance order',
      (res.data?.items ?? []).map((c: Json) => c.title),
      ['Budget', 'Budget review', 'Team budget', 'Trip planning'],
    );

    ctx.step('Search a word that is only in a message (A9, TC-36)');
    res = await api.get('/conversations', {
      as: alice,
      query: { search: 'ITINERARY' },
    });
    ctx.expect(res, 200);
    ctx.equal(
      'found by message content, case-insensitive',
      (res.data?.items ?? []).map((c: Json) => c.id),
      [chat.conversationId],
    );

    ctx.step('bob searches the same word');
    res = await api.get('/conversations', {
      as: bob,
      query: { search: 'itinerary' },
    });
    ctx.expect(res, 200);
    ctx.equal('bob sees nothing', res.data?.meta?.total, 0);

    ctx.step('Page 1 of 2 items, newest updated first (A9)');
    res = await api.get('/conversations', {
      as: alice,
      query: { page: 1, limit: 2, sort: '-updatedAt' },
    });
    ctx.expect(res, 200);
    ctx.equal('items on the page', res.data?.items?.length, 2);
    ctx.check(
      'meta.total counts every conversation of alice',
      Number(res.data?.meta?.total) >= 4,
    );
    ctx.check(
      'every item has messageCount',
      (res.data?.items ?? []).every(
        (c: Json) => typeof c.messageCount === 'number',
      ),
    );

    ctx.step(
      'include=messages&latestMessages=2 (A9, CONV-04)',
      'The trip chat has 4 messages: the last two come back, oldest first.',
    );
    res = await api.get('/conversations', {
      as: alice,
      query: { search: 'trip', include: 'messages', latestMessages: 2 },
    });
    ctx.expect(res, 200);
    const item: Json = res.data?.items?.[0];
    ctx.equal('messageCount', item?.messageCount, 4);
    ctx.equal(
      'sequences of latestMessages',
      (item?.messages ?? []).map((m: Json) => m.sequence),
      [3, 4],
    );
    ctx.equal(
      'senders',
      (item?.messages ?? []).map((m: Json) => m.sender),
      ['user', 'assistant'],
    );

    ctx.step(
      'include=feedback on the list (A9)',
      'Python silently ignored it; now 400.',
    );
    res = await api.get('/conversations', {
      as: alice,
      query: { include: 'feedback' },
    });
    ctx.expectInvalid(res, 'include');

    ctx.step('latestMessages above the max of 20 (A9)');
    res = await api.get('/conversations', {
      as: alice,
      query: { include: 'messages', latestMessages: 21 },
    });
    ctx.expectInvalid(res, 'latestMessages');
  },
};

export const forkScenario: Scenario = {
  id: 'fork',
  title: 'Fork a conversation at an assistant message',
  tasks: 'CONV-03, SYNC-02',
  apis: 'A12a',
  journal: 'docs/journal/017, 019',
  summary:
    'The child copies the prefix (sequence kept), requestId makes it idempotent (200 replay, 409 other body, 410 child deleted), and `conversation.forked` goes to the outbox for the Engine.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);
    const chat = await seedChat(ctx, alice, 'Trip to Da Nang');
    const [, m2, m3] = chat.messages;
    const requestId = randomUUID();
    const path = `/conversations/${chat.conversationId}/forks`;

    ctx.step(
      'Fork at the first assistant message (sequence 2)',
      'Runs under the source turn lock, in a REPEATABLE READ transaction.',
    );
    let res = await api.post(path, {
      as: alice,
      body: { messageId: m2.id, requestId },
    });
    ctx.expect(res, 201);
    const child: Json = res.data;
    ctx.equal('default title', child?.title, 'Trip to Da Nang (fork)');
    ctx.equal(
      'forkedFromConversationId',
      child?.forkedFromConversationId,
      chat.conversationId,
    );
    ctx.equal('forkedFromMessageId', child?.forkedFromMessageId, m2.id);
    ctx.equal('forkedThroughSequence', child?.forkedThroughSequence, 2);

    ctx.step(
      'Messages of the child (A10, sort=sequence)',
      'Only the prefix 1..2 is copied, with new ids and the SAME sequence numbers.',
    );
    res = await api.get(`/conversations/${String(child?.id)}/messages`, {
      as: alice,
      query: { sort: 'sequence' },
    });
    ctx.expect(res, 200);
    const copied: Json[] = res.data?.items ?? [];
    ctx.equal(
      'sequences',
      copied.map((m) => m.sequence),
      [1, 2],
    );
    ctx.equal(
      'contents',
      copied.map((m) => m.content),
      [chat.messages[0].content, m2.content],
    );
    ctx.check(
      'new message ids',
      copied.every((m) => m.id !== chat.messages[0].id && m.id !== m2.id),
    );

    ctx.step(
      'Replay the same request (same requestId + body)',
      'Idempotent: 200 and the same child, nothing new is created.',
    );
    res = await api.post(path, {
      as: alice,
      body: { messageId: m2.id, requestId },
    });
    ctx.expect(res, 200);
    ctx.equal('same child', res.data?.id, child?.id);

    ctx.step(
      'Same requestId, different body (title)',
      'The fingerprint (sha256 of source, message, title) differs ⇒ 409.',
    );
    res = await api.post(path, {
      as: alice,
      body: { messageId: m2.id, requestId, title: 'Another title' },
    });
    ctx.expect(res, 409, 'request_conflict');

    ctx.step('Fork at a USER message');
    res = await api.post(path, {
      as: alice,
      body: { messageId: m3.id, requestId: randomUUID() },
    });
    ctx.expect(res, 409, 'message_not_forkable');

    ctx.step('Fork at a message that is not in this conversation');
    res = await api.post(path, {
      as: alice,
      body: { messageId: randomUUID(), requestId: randomUUID() },
    });
    ctx.expect(res, 404, 'message_not_found');

    ctx.step('bob forks alice’s conversation');
    res = await api.post(path, {
      as: bob,
      body: { messageId: m2.id, requestId: randomUUID() },
    });
    ctx.expect(res, 404, 'conversation_not_found');

    ctx.step('Fork with a custom title at sequence 4');
    res = await api.post(path, {
      as: alice,
      body: {
        messageId: chat.messages[3].id,
        requestId: randomUUID(),
        title: 'Da Nang, budget version',
      },
    });
    ctx.expect(res, 201);
    ctx.equal('forkedThroughSequence', res.data?.forkedThroughSequence, 4);

    ctx.step(
      'Outbox: conversation.forked',
      'The Engine builds the child’s own summary up to forkedThroughSequence and reads messages via B2.',
    );
    const rows = await ctx.sql(
      'events written in the fork transactions',
      `SELECT event_type, aggregate_id, payload, status FROM outbox_events
        WHERE event_type = 'conversation.forked' AND payload->>'sourceConversationId' = $1
        ORDER BY created_at`,
      [chat.conversationId],
    );
    ctx.equal('one event per created child (replays add none)', rows.length, 2);

    ctx.step(
      'Delete the first child, then replay its requestId',
      '410: the result of this request existed but was deleted.',
    );
    res = await api.delete(`/conversations/${String(child?.id)}`, {
      as: alice,
    });
    ctx.expect(res, 200);
    res = await api.post(path, {
      as: alice,
      body: { messageId: m2.id, requestId },
    });
    ctx.expect(res, 410, 'result_deleted');
  },
};

export const deleteConversationScenario: Scenario = {
  id: 'delete-conversation',
  title: 'Delete a conversation',
  tasks: 'CONV-02',
  apis: 'A12 (A25 folds into it)',
  journal: 'docs/journal/011',
  summary:
    'Soft delete + `conversation.deleted` in the outbox in the same transaction; the conversation, its messages and its feedback disappear from the API, fork children stay.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);
    const chat = await seedChat(ctx, alice, 'To be deleted');
    const [, m2] = chat.messages;

    ctx.step('Setup: fork it once, so we can see that children survive');
    let res = await api.post(`/conversations/${chat.conversationId}/forks`, {
      as: alice,
      body: { messageId: m2.id, requestId: randomUUID() },
    });
    ctx.expect(res, 201);
    const childId = String(res.data?.id);

    ctx.step('bob deletes alice’s conversation (A12)');
    res = await api.delete(`/conversations/${chat.conversationId}`, {
      as: bob,
    });
    ctx.expect(res, 404, 'conversation_not_found');

    ctx.step('alice deletes it (A12)');
    res = await api.delete(`/conversations/${chat.conversationId}`, {
      as: alice,
    });
    ctx.expect(res, 200);
    ctx.equal('data', res.data, null);

    ctx.step('Everything under it is gone from the API');
    res = await api.get(`/conversations/${chat.conversationId}`, { as: alice });
    ctx.expect(res, 404, 'conversation_not_found');
    res = await api.get(`/conversations/${chat.conversationId}/messages`, {
      as: alice,
    });
    ctx.expect(res, 404, 'conversation_not_found');
    res = await api.get(`/messages/${m2.id}`, { as: alice });
    ctx.expect(res, 404, 'message_not_found');
    res = await api.get('/conversations', {
      as: alice,
      query: { search: 'To be deleted' },
    });
    ctx.check(
      'not in the list any more',
      !(res.data?.items ?? []).some((c: Json) => c.id === chat.conversationId),
    );

    ctx.step('The fork child is kept');
    res = await api.get(`/conversations/${childId}`, { as: alice });
    ctx.expect(res, 200);
    ctx.equal(
      'still points at its source',
      res.data?.forkedFromConversationId,
      chat.conversationId,
    );

    ctx.step('Delete again (A12)');
    res = await api.delete(`/conversations/${chat.conversationId}`, {
      as: alice,
    });
    ctx.expect(res, 404, 'conversation_not_found');

    ctx.step('Database and outbox');
    await ctx.sql(
      'soft delete: the row stays with deleted_at set',
      `SELECT id, title, deleted_at IS NOT NULL AS deleted FROM conversations WHERE id = $1`,
      [chat.conversationId],
    );
    const rows = await ctx.sql(
      'conversation.deleted, written in the same transaction',
      `SELECT event_type, aggregate_id, payload, status FROM outbox_events
        WHERE event_type = 'conversation.deleted' AND aggregate_id = $1`,
      [chat.conversationId],
    );
    ctx.equal('one event', rows.length, 1);
    ctx.note(
      'threadIds stays empty until chat turns exist (W4): the thread source is a stub (NoThreadSource) for now.',
    );
  },
};
