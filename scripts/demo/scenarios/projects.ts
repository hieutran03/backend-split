import type { DemoContext, Scenario } from '../context';
import { createConversation, ensureUsers } from './fixtures';

export const projectsScenario: Scenario = {
  id: 'projects',
  title: 'Projects CRUD',
  tasks: 'F-10',
  apis: 'PJ1, PJ2, PJ3, PJ4',
  journal: 'docs/journal/003',
  summary:
    'The template module: create, list with S2 pagination, read, update; another user’s project answers 404 (D15).',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);

    ctx.step('Create two projects (PJ2)');
    let res = await api.post('/projects', {
      as: alice,
      body: {
        name: 'Q3 report',
        description: 'Quarterly numbers',
        instructions: 'Answer briefly',
      },
    });
    ctx.expect(res, 201);
    const projectId = String(res.data?.id);
    res = await api.post('/projects', {
      as: alice,
      body: { name: 'Side notes' },
    });
    ctx.expect(res, 201);

    ctx.step(
      'Create with a blank name (PJ2)',
      'Names are trimmed, so "   " is empty ⇒ 400.',
    );
    res = await api.post('/projects', { as: alice, body: { name: '   ' } });
    ctx.expectInvalid(res, 'name');

    ctx.step(
      'List my projects, 1 per page (PJ1)',
      'S2 pagination: data = { items, meta: { page, limit, total, totalPages } }.',
    );
    res = await api.get('/projects', {
      as: alice,
      query: { page: 1, limit: 1, sort: '-createdAt' },
    });
    ctx.expect(res, 200);
    ctx.equal('meta', res.data?.meta, {
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    ctx.equal('newest first', res.data?.items?.[0]?.name, 'Side notes');

    ctx.step('Read the project (PJ3)');
    res = await api.get(`/projects/${projectId}`, { as: alice });
    ctx.expect(res, 200);
    ctx.equal('instructions', res.data?.instructions, 'Answer briefly');

    ctx.step(
      'bob reads alice’s project (PJ3)',
      'Not yours = not found (D15): never 403, so ids cannot be probed.',
    );
    res = await api.get(`/projects/${projectId}`, { as: bob });
    ctx.expect(res, 404, 'project_not_found');

    ctx.step(
      'Update the project (PJ4)',
      '`instructions: null` clears the field.',
    );
    res = await api.patch(`/projects/${projectId}`, {
      as: alice,
      body: { name: 'Q3 report (final)', instructions: null },
    });
    ctx.expect(res, 200);
    ctx.equal('name', res.data?.name, 'Q3 report (final)');
    ctx.equal('instructions', res.data?.instructions, null);

    ctx.step('Update with an empty body (PJ4)');
    res = await api.patch(`/projects/${projectId}`, { as: alice, body: {} });
    ctx.expectInvalid(res, '(root)');

    ctx.step('A malformed id in the path');
    res = await api.get('/projects/not-a-uuid', { as: alice });
    ctx.expectInvalid(res, '(root)');
  },
};

export const projectMembershipScenario: Scenario = {
  id: 'project-membership',
  title: 'Move conversations between projects, delete a project',
  tasks: 'PJ-06, PJ-05',
  apis: 'PJ6, PJ7, PJ5',
  journal: 'docs/journal/015',
  summary:
    'Attach/detach is idempotent and checks both sides; deleting a project keeps its conversations (detached) and writes the `project.deleted` outbox event in the same transaction.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);

    ctx.step(
      'Setup: projects P1, P2 and two conversations (C1 in P1, C2 loose)',
    );
    let res = await api.post('/projects', {
      as: alice,
      body: { name: 'P1 research' },
    });
    ctx.expect(res, 201);
    const p1 = String(res.data?.id);
    res = await api.post('/projects', {
      as: alice,
      body: { name: 'P2 writing' },
    });
    ctx.expect(res, 201);
    const p2 = String(res.data?.id);
    const c1 = String(
      (
        await createConversation(ctx, alice, {
          title: 'Sources to read',
          projectId: p1,
        })
      ).id,
    );
    const c2 = String(
      (await createConversation(ctx, alice, { title: 'Outline' })).id,
    );

    ctx.step('Move C1 from P1 into P2 (PJ6)');
    res = await api.put(`/projects/${p2}/conversations/${c1}`, { as: alice });
    ctx.expect(res, 200);
    ctx.equal('membership', res.data, { conversationId: c1, projectId: p2 });

    ctx.step(
      'Repeat the same move (PJ6)',
      'Idempotent: same answer, nothing changes.',
    );
    res = await api.put(`/projects/${p2}/conversations/${c1}`, { as: alice });
    ctx.expect(res, 200);

    ctx.step('Remove C1 from P1, where it no longer is (PJ7)');
    res = await api.delete(`/projects/${p1}/conversations/${c1}`, {
      as: alice,
    });
    ctx.expect(res, 404, 'conversation_not_in_project');

    ctx.step(
      'bob moves alice’s conversation into alice’s project (PJ6)',
      'Both sides are checked against the caller.',
    );
    res = await api.put(`/projects/${p2}/conversations/${c2}`, { as: bob });
    ctx.expect(res, 404, 'project_not_found');

    ctx.step('Move C2 into P2 too, then list P2 (PJ6, A9 ?projectId)');
    res = await api.put(`/projects/${p2}/conversations/${c2}`, { as: alice });
    ctx.expect(res, 200);
    res = await api.get('/conversations', {
      as: alice,
      query: { projectId: p2 },
    });
    ctx.expect(res, 200);
    ctx.equal('conversations in P2', res.data?.meta?.total, 2);

    ctx.step('Remove C2 from P2 (PJ7)');
    res = await api.delete(`/projects/${p2}/conversations/${c2}`, {
      as: alice,
    });
    ctx.expect(res, 200);
    ctx.equal('membership', res.data, { conversationId: c2, projectId: null });
    res = await api.put(`/projects/${p2}/conversations/${c2}`, { as: alice });
    ctx.expect(res, 200);

    ctx.step(
      'Delete P2 (PJ5)',
      'Soft delete; C1 and C2 stay, detached (project_id = NULL) in the same transaction.',
    );
    res = await api.delete(`/projects/${p2}`, { as: alice });
    ctx.expect(res, 200);
    res = await api.get(`/projects/${p2}`, { as: alice });
    ctx.expect(res, 404, 'project_not_found');
    res = await api.get(`/conversations/${c1}`, { as: alice });
    ctx.expect(res, 200);
    ctx.equal('C1 projectId', res.data?.projectId, null);
    res = await api.get(`/conversations/${c2}`, { as: alice });
    ctx.equal('C2 projectId', res.data?.projectId, null);
    const rows = await ctx.sql(
      'the outbox row written with the delete (the Engine will soft-delete the project’s user_memories)',
      `SELECT event_type, aggregate_type, aggregate_id, payload, status FROM outbox_events
        WHERE event_type = 'project.deleted' AND aggregate_id = $1`,
      [p2],
    );
    ctx.equal('project.deleted rows', rows.length, 1);
    ctx.equal(
      'payload.detachedConversations',
      rows[0]?.payload?.detachedConversations,
      2,
    );

    ctx.step('Delete P2 again (PJ5)');
    res = await api.delete(`/projects/${p2}`, { as: alice });
    ctx.expect(res, 404, 'project_not_found');
  },
};
