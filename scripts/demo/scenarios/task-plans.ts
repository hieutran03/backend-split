import type { DemoContext, Scenario } from '../context';
import type { Json } from '../kit';
import { createConversation, ensureUsers } from './fixtures';

export const taskPlansScenario: Scenario = {
  id: 'task-plans',
  title: 'Task plans and plan_lifecycle',
  tasks: 'TP-01, TP-02',
  apis: 'A36–A42',
  journal: 'docs/journal/016, 019',
  summary:
    'Adding tasks turns planning mode on and sets the lifecycle to draft; every task change recomputes conversations.plan_lifecycle (draft → executing → completed → null) in the same transaction, as Python TaskPlanService does.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice, bob } = await ensureUsers(ctx);
    const conversationId = String(
      (await createConversation(ctx, alice, { title: 'Release checklist' })).id,
    );
    const lifecycle = async (expected: string | null): Promise<void> => {
      const res = await api.get(
        `/conversations/${conversationId}/planning-status`,
        { as: alice },
      );
      ctx.expect(res, 200);
      ctx.equal('planLifecycle', res.data?.planLifecycle, expected);
    };

    ctx.step('Planning status before any task (A42)');
    let res = await api.get(
      `/conversations/${conversationId}/planning-status`,
      { as: alice },
    );
    ctx.expect(res, 200);
    ctx.equal('planningModeEnabled', res.data?.planningModeEnabled, false);
    ctx.equal('planLifecycle', res.data?.planLifecycle, null);
    ctx.equal('totalTasks', res.data?.totalTasks, 0);

    ctx.step(
      'Add 3 tasks (A36)',
      'Appended with taskOrder 0, 1, 2; planning mode on; lifecycle ⇒ draft.',
    );
    res = await api.post(`/conversations/${conversationId}/task-plans`, {
      as: alice,
      body: {
        taskDescriptions: [
          'Freeze the branch',
          'Run the smoke tests',
          'Write release notes',
        ],
      },
    });
    ctx.expect(res, 201);
    const tasks: Json[] = res.data ?? [];
    ctx.equal(
      'taskOrder',
      tasks.map((t) => t.taskOrder),
      [0, 1, 2],
    );
    ctx.equal(
      'status',
      tasks.map((t) => t.status),
      ['pending', 'pending', 'pending'],
    );
    res = await api.get(`/conversations/${conversationId}`, { as: alice });
    ctx.equal(
      'conversation.planningModeEnabled',
      res.data?.planningModeEnabled,
      true,
    );
    ctx.equal('conversation.planLifecycle', res.data?.planLifecycle, 'draft');
    const [t1, t2, t3] = tasks;

    ctx.step('A blank description (A36)');
    res = await api.post(`/conversations/${conversationId}/task-plans`, {
      as: alice,
      body: { taskDescriptions: ['ok', '   '] },
    });
    ctx.expectInvalid(res, 'taskDescriptions.1');

    ctx.step('bob adds a task to alice’s plan (A36)');
    res = await api.post(`/conversations/${conversationId}/task-plans`, {
      as: bob,
      body: { taskDescriptions: ['x'] },
    });
    ctx.expect(res, 404, 'conversation_not_found');

    ctx.step(
      'Start task 1: status in_progress (A39)',
      'Any task in progress ⇒ executing.',
    );
    res = await api.patch(`/task-plans/${String(t1?.id)}`, {
      as: alice,
      body: { status: 'in_progress' },
    });
    ctx.expect(res, 200);
    await lifecycle('executing');

    ctx.step(
      '`completedAt` cannot be set by hand (A39)',
      'It follows status; the body is strict.',
    );
    res = await api.patch(`/task-plans/${String(t1?.id)}`, {
      as: alice,
      body: { completedAt: '2026-01-01T00:00:00Z' },
    });
    ctx.expectInvalid(res, '(root)');

    ctx.step('Complete task 1 (A40), skip task 2 (A39)');
    res = await api.post(`/task-plans/${String(t1?.id)}/complete`, {
      as: alice,
    });
    ctx.expect(res, 200);
    ctx.check('completedAt is set', typeof res.data?.completedAt === 'string');
    res = await api.patch(`/task-plans/${String(t2?.id)}`, {
      as: alice,
      body: { status: 'skipped' },
    });
    ctx.expect(res, 200);

    ctx.step('Planning status mid-way (A42)');
    res = await api.get(`/conversations/${conversationId}/planning-status`, {
      as: alice,
    });
    ctx.expect(res, 200);
    ctx.equal(
      'counts',
      [
        res.data?.pendingTasks,
        res.data?.completedTasks,
        res.data?.skippedTasks,
      ],
      [1, 1, 1],
    );
    ctx.equal('nextTask', res.data?.nextTask?.id, t3?.id);
    ctx.note(`progressPercentage = ${String(res.data?.progressPercentage)}`);

    ctx.step(
      'List tasks (A37)',
      'Completed and skipped tasks only with includeCompleted=true.',
    );
    res = await api.get(`/conversations/${conversationId}/task-plans`, {
      as: alice,
    });
    ctx.expect(res, 200);
    ctx.equal(
      'open tasks',
      (res.data ?? []).map((t: Json) => t.description),
      ['Write release notes'],
    );
    res = await api.get(`/conversations/${conversationId}/task-plans`, {
      as: alice,
      query: { includeCompleted: 'true' },
    });
    ctx.equal('all tasks', (res.data ?? []).length, 3);

    ctx.step(
      'Complete the last task (A40)',
      'Every task completed or skipped ⇒ completed.',
    );
    res = await api.post(`/task-plans/${String(t3?.id)}/complete`, {
      as: alice,
    });
    ctx.expect(res, 200);
    await lifecycle('completed');

    ctx.step('Read one task (A38), and bob reads it');
    res = await api.get(`/task-plans/${String(t3?.id)}`, { as: alice });
    ctx.expect(res, 200);
    res = await api.get(`/task-plans/${String(t3?.id)}`, { as: bob });
    ctx.expect(res, 404);

    ctx.step(
      'Delete every task (A41, hard delete)',
      'No tasks ⇒ lifecycle back to null.',
    );
    for (const task of tasks) {
      res = await api.delete(`/task-plans/${String(task.id)}`, { as: alice });
      ctx.expect(res, 200);
    }
    await lifecycle(null);
    await ctx.sql(
      'what is stored on the conversation',
      `SELECT title, planning_mode_enabled, plan_lifecycle FROM conversations WHERE id = $1`,
      [conversationId],
    );
  },
};
