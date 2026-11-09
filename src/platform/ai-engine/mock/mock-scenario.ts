/**
 * Kịch bản của mock AI Engine, chọn bằng marker trong nội dung tin nhắn.
 *
 * Ví dụ gửi tin nhắn: "Tra cứu thời tiết [mock:tool] [mock:interrupt]".
 * Không có marker => `answer` (trả lời bình thường, stream từng token).
 *
 * | Marker               | Hành vi                                                      |
 * |----------------------|--------------------------------------------------------------|
 * | [mock:tool]          | chèn tool_execution_start/end trước câu trả lời              |
 * | [mock:subagent]      | chèn subagent_start/end (planning worker)                    |
 * | [mock:sources]       | phát `sources` trước complete                                |
 * | [mock:reasoning]     | phát reasoning_delta trước câu trả lời                       |
 * | [mock:todo]          | complete có todoUpdates (→ task_plans)                       |
 * | [mock:media]         | complete có generatedMedia (→ chat_images)                   |
 * | [mock:interrupt]     | dừng ở tool cần duyệt → terminal `interrupt` (HITL)          |
 * | [mock:continuation]  | hết budget → terminal `continuation_available`               |
 * | [mock:error]         | terminal `error` (WorkflowErrorCode=mock_failure)            |
 * | [mock:disconnect]    | stream đứt giữa chừng, KHÔNG có terminal (test engine_disconnect) |
 * | [mock:slow]          | delay mỗi event x10 (test Stop, heartbeat, lease)            |
 * | [mock:long]          | câu trả lời dài (~200 token)                                 |
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
  /** Tin nhắn đã bỏ marker. */
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
