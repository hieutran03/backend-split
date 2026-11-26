import type { DemoContext, Scenario } from '../context';
import type { Json } from '../kit';
import { ensureUsers } from './fixtures';

export const healthScenario: Scenario = {
  id: 'health',
  title: 'Health, Swagger, envelope',
  tasks: 'F-05, F-11, F-16',
  apis: 'H9, H10–H13',
  journal: 'docs/journal/001, 004',
  summary:
    'Liveness and dependency checks (PostgreSQL + AI Engine E21, here the mock), the OpenAPI document generated from the zod schemas, and the { success, code, message, data } envelope on errors.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;

    ctx.step('Liveness (H9)', 'Public route: no token needed.');
    let res = await api.get('/health');
    ctx.expect(res, 200);
    ctx.equal(
      'envelope',
      { success: res.body?.success, code: res.body?.code },
      { success: true, code: 'ok' },
    );

    ctx.step(
      'Dependencies (H10–H13)',
      'PostgreSQL SELECT 1 + AI Engine health (E21) — the in-process mock in this demo.',
    );
    res = await api.get('/health/dependencies');
    ctx.expect(res, 200);
    ctx.equal('postgres', res.data?.checks?.postgres?.status, 'ok');
    ctx.equal('aiEngine', res.data?.checks?.aiEngine?.status, 'ok');

    ctx.step(
      'OpenAPI document (F-16)',
      'Generated from the same zod schemas that validate requests.',
    );
    const started = performance.now();
    const response = await fetch(api.url('').origin + '/docs-json');
    const doc: Json = await response.json();
    const paths = Object.keys(doc?.paths ?? {});
    ctx.log.print(
      `    ${ctx.log.bold('→')} GET /docs-json ${ctx.log.dim(`(${Math.round(performance.now() - started)} ms)`)}`,
    );
    ctx.check(`HTTP 200 (got ${response.status})`, response.status === 200);
    ctx.note(`${paths.length} paths documented:`);
    for (const path of paths) {
      const methods = Object.keys(doc.paths[path] ?? {})
        .map((m) => m.toUpperCase())
        .join(', ');
      ctx.log.print(`        ${ctx.log.gray(`${methods.padEnd(18)} ${path}`)}`);
    }

    ctx.step('Error envelope on an unknown route');
    res = await api.get('/no-such-route');
    ctx.expect(res, 404);
    ctx.equal('success', res.body?.success, false);
    ctx.check(
      'has code and message',
      typeof res.body?.code === 'string' &&
        typeof res.body?.message === 'string',
    );
  },
};

export const outboxScenario: Scenario = {
  id: 'outbox',
  title: 'Outbox: every integration event written so far',
  tasks: 'F-06, DS-01',
  apis: '—',
  journal: 'docs/journal/021',
  summary:
    'Cross-domain side effects are rows in outbox_events, written in the same transaction as the change. The relay that pushes them to Redis Streams (bus:backend:events) is BUS-01, not built yet, so they stay pending.',
  async run(ctx: DemoContext): Promise<void> {
    ctx.step('All outbox rows of this run');
    const rows = await ctx.sql(
      'ordered by creation',
      `SELECT created_at, event_type, aggregate_type, aggregate_id, status, attempt_count, payload
         FROM outbox_events ORDER BY created_at`,
    );
    ctx.step('Count by event type');
    await ctx.sql(
      'summary',
      `SELECT event_type, status, count(*)::int AS events FROM outbox_events GROUP BY 1, 2 ORDER BY 1`,
    );
    ctx.check(
      'every row is pending (no relay before BUS-01)',
      rows.every((r: Json) => r.status === 'pending'),
    );
    const known = new Set([
      'conversation.deleted',
      'conversation.forked',
      'project.deleted',
    ]);
    ctx.check(
      'only event types of the backend → Engine contract (src/contracts/events)',
      rows.every((r: Json) => known.has(String(r.event_type))),
    );
  },
};

export const engineMockScenario: Scenario = {
  id: 'engine-mock',
  title: 'Mock AI Engine: one chat turn as a V3 NDJSON stream',
  tasks: 'F-07, F-08, F-11',
  apis: 'E1 (via the dev playground POST /dev/engine/turns)',
  journal: 'docs/journal/002',
  summary:
    'The dev playground sends one TurnRequestV1 to the AiEngineClient port (mock here) and streams the V3 events back: seq rises from 1, exactly one terminal event. Markers in the message pick the scenario.',
  async run(ctx: DemoContext): Promise<void> {
    const { alice } = await ensureUsers(ctx);
    const cases: ReadonlyArray<{
      message: string;
      terminal: string;
      why: string;
    }> = [
      {
        message: 'Hello there',
        terminal: 'complete',
        why: 'No marker: a plain answer.',
      },
      {
        message: 'Weather in Hue [mock:tool] [mock:reasoning] [mock:sources]',
        terminal: 'complete',
        why: 'Reasoning, one tool call and sources before the answer.',
      },
      {
        message: 'Clean the disk [mock:tool] [mock:interrupt]',
        terminal: 'interrupt',
        why: 'HITL: the tool run_shell needs approval ⇒ the turn ends with interrupt.',
      },
      {
        message: 'Break please [mock:error]',
        terminal: 'error',
        why: 'The turn fails ⇒ terminal error.',
      },
      {
        message: 'Long answer [mock:continuation]',
        terminal: 'continuation_available',
        why: 'Budget reached ⇒ the client may continue (E4).',
      },
    ];
    for (const item of cases) {
      ctx.step(`Turn: "${item.message}"`, item.why);
      const { status, events } = await ctx.api.stream('/dev/engine/turns', {
        as: alice,
        body: { message: item.message },
      });
      ctx.check(`HTTP 200 (got ${status})`, status === 200);
      const seqs = events.map((e: Json) => Number(e.seq));
      ctx.check(
        'seq = 1, 2, 3, … without gaps',
        seqs.every((s, i) => s === i + 1),
      );
      const terminals = events.filter((e: Json) =>
        ['complete', 'interrupt', 'continuation_available', 'error'].includes(
          String(e.type),
        ),
      );
      ctx.equal(
        'terminal events',
        terminals.map((e: Json) => e.type),
        [item.terminal],
      );
      ctx.check(
        'the terminal event is the last one',
        events[events.length - 1] === terminals[0],
      );
    }
  },
};
