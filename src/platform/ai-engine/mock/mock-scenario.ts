/**
 * Mock AI Engine scenarios, selected by markers in the message content.
 *
 * Example message: "Look up the weather [mock:tool] [mock:interrupt]".
 * No marker => `answer` (normal reply, streamed token by token).
 *
 * | Marker               | Behavior                                                     |
 * |----------------------|--------------------------------------------------------------|
 * | [mock:tool]          | insert tool_execution_start/end before the answer            |
 * | [mock:subagent]      | insert subagent_start/end (planning worker)                  |
 * | [mock:sources]       | emit `sources` before complete                               |
 * | [mock:reasoning]     | emit reasoning_delta before the answer                       |
 * | [mock:todo]          | complete carries todoUpdates (→ task_plans)                  |
 * | [mock:media]         | complete carries generatedMedia (→ chat_images)              |
 * | [mock:interrupt]     | stop at tool needing approval → terminal `interrupt` (HITL)  |
 * | [mock:continuation]  | budget exhausted → terminal `continuation_available`         |
 * | [mock:error]         | terminal `error` (WorkflowErrorCode=mock_failure)            |
 * | [mock:disconnect]    | stream breaks midway, NO terminal (test engine_disconnect)   |
 * | [mock:slow]          | delay each event x10 (test Stop, heartbeat, lease)           |
 * | [mock:long]          | long answer (~200 tokens)                                    |
 */
export type MockTerminal =
  'complete' | 'interrupt' | 'continuation' | 'error' | 'disconnect';

export interface MockScenario {
  readonly terminal: MockTerminal;
  readonly withTool: boolean;
  readonly withSubagent: boolean;
  readonly withSources: boolean;
  readonly withReasoning: boolean;
  readonly withTodos: boolean;
  readonly withMedia: boolean;
  readonly slow: boolean;
  readonly long: boolean;
  /** Message with markers stripped. */
  readonly cleanMessage: string;
}

const MARKER = /\[mock:([a-z]+)\]/gi;

export function parseScenario(message: string): MockScenario {
  const flags = new Set<string>();
  for (const match of message.matchAll(MARKER)) {
    flags.add((match[1] ?? '').toLowerCase());
  }
  const terminal: MockTerminal = flags.has('disconnect')
    ? 'disconnect'
    : flags.has('error')
      ? 'error'
      : flags.has('interrupt')
        ? 'interrupt'
        : flags.has('continuation')
          ? 'continuation'
          : 'complete';
  return {
    terminal,
    withTool: flags.has('tool'),
    withSubagent: flags.has('subagent'),
    withSources: flags.has('sources'),
    withReasoning: flags.has('reasoning'),
    withTodos: flags.has('todo'),
    withMedia: flags.has('media'),
    slow: flags.has('slow'),
    long: flags.has('long'),
    cleanMessage: message.replace(MARKER, '').replace(/\s+/g, ' ').trim(),
  };
}
