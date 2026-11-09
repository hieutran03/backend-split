import type { TurnRequestV1 } from '@contracts/engine/internal-api';
import {
  isTerminalEvent,
  type V3StreamEvent,
} from '@contracts/engine/v3-events';
import { MockAiEngineClient } from './mock-ai-engine.client';
import { parseScenario } from './mock-scenario';

function turn(message: string, generationId = 'gen-1'): TurnRequestV1 {
  return {
    generationId,
    generationVersion: 1,
    executionEpoch: 1,
    conversationId: 'conv-1',
    userId: 'user-1',
    userMessageId: 'um-1',
    assistantMessageId: 'am-1',
    checkpointThreadId: 'routing-v2:conv-1:um-1',
    message,
    persona: null,
    attachments: [],
    modelRequest: null,
    modelRuntime: null,
    historyHint: null,
    documents: [],
    projectId: null,
    projectInstructions: null,
    planning: { planningModeEnabled: false, tasks: [] },
    customAgents: {},
    hitlPolicy: { clientRules: {} },
    deviceId: null,
    deviceSessionId: null,
    inlineRichResponseV1: true,
  };
}

async function collect(
  stream: AsyncIterable<V3StreamEvent>,
): Promise<V3StreamEvent[]> {
  const out: V3StreamEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

const engine = () =>
  new MockAiEngineClient({
    delayMs: 0,
    indexDelayMs: 0,
    backendCallbackBaseUrl: '',
    serviceToken: 't',
  });

describe('MockAiEngineClient — honors the V3 contract', () => {
  it('normal turn: seq increases, exactly 1 terminal complete at the end', async () => {
    const events = await collect(engine().startTurn(turn('hello')));
    expect(events[0]?.type).toBe('run_start');
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    const last = events.at(-1);
    expect(last?.type).toBe('complete');
    const text = events
      .filter((e) => e.type === 'message_delta')
      .map((e) => (e.type === 'message_delta' ? e.data.delta : ''))
      .join('');
    if (last?.type === 'complete') expect(last.data.response.text).toBe(text);
  });

  it.each([
    ['[mock:interrupt]', 'interrupt'],
    ['[mock:continuation]', 'continuation_available'],
    ['[mock:error]', 'error'],
  ])('%s => terminal %s', async (marker, terminal) => {
    const events = await collect(engine().startTurn(turn(`ask ${marker}`)));
    expect(events.at(-1)?.type).toBe(terminal);
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
  });

  it('[mock:disconnect] => stream ends WITHOUT a terminal', async () => {
    const events = await collect(
      engine().startTurn(turn('x [mock:disconnect]')),
    );
    expect(events.some(isTerminalEvent)).toBe(false);
  });

  it('[mock:tool] emits a tool_execution_start/end pair', async () => {
    const types = (
      await collect(engine().startTurn(turn('x [mock:tool]')))
    ).map((e) => e.type);
    expect(types).toContain('tool_execution_start');
    expect(types).toContain('tool_execution_end');
  });

  it('stopTurn midway => complete(stopped); then not_inflight', async () => {
    const e = engine();
    const out: V3StreamEvent[] = [];
    for await (const event of e.startTurn(turn('x [mock:long]', 'gen-stop'))) {
      out.push(event);
      if (event.type === 'message_delta' && out.length === 5) {
        await expect(
          e.stopTurn('gen-stop', { version: 1, reason: 'user_stop' }),
        ).resolves.toEqual({
          status: 'stop_requested',
        });
      }
    }
    const last = out.at(-1);
    expect(last?.type).toBe('complete');
    if (last?.type === 'complete') expect(last.data.status).toBe('stopped');
    await expect(
      e.stopTurn('gen-stop', { version: 1, reason: 'user_stop' }),
    ).resolves.toEqual({
      status: 'not_inflight',
    });
  });

  it('parseScenario strips markers from the message', () => {
    expect(
      parseScenario('  hello [mock:tool]  world [MOCK:error]').cleanMessage,
    ).toBe('hello world');
  });
});
