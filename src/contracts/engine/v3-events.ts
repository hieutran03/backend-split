/**
 * Sự kiện stream V3 mà AI Engine trả về qua NDJSON (mỗi dòng 1 event).
 *
 * ⚠️ DRAFT — suy ra từ tài liệu Backend Split (§1b, §8). Phải đối chiếu lại với
 * `app/services/event_streaming/events.py` của repo chatbot (task ENG-01) rồi
 * mới freeze. Mọi thay đổi breaking => tăng `v`.
 *
 * Quy tắc hợp đồng (§8):
 *  - heartbeat mỗi 5 s khi không có event;
 *  - ĐÚNG MỘT sự kiện cuối: complete | interrupt | continuation_available | error;
 *  - im lặng > 5 s × 3 => backend coi như đứt stream (engine_disconnect).
 */
export const V3_VERSION = 3 as const;

interface Base<T extends string, D> {
  readonly v: typeof V3_VERSION;
  readonly type: T;
  /** Tăng dần trong một lượt, bắt đầu từ 1. Dùng để phát hiện mất/lặp event. */
  readonly seq: number;
  readonly generationId: string;
  /** ISO-8601 */
  readonly ts: string;
  readonly data: D;
}

// ---------------------------------------------------------------- non-terminal
export type RunStartEvent = Base<
  'run_start',
  { executionEpoch: number; checkpointThreadId: string }
>;
export type AgentSelectedEvent = Base<
  'agent_selected',
  { agentId: string; agentName?: string }
>;
export type MessageDeltaEvent = Base<
  'message_delta',
  { messageId: string; delta: string }
>;
export type ReasoningDeltaEvent = Base<
  'reasoning_delta',
  { messageId: string; delta: string }
>;
export type ToolOrigin = 'builtin' | 'mcp' | 'client';
export type ToolExecutionStartEvent = Base<
  'tool_execution_start',
  {
    toolCallId: string;
    toolName: string;
    toolOrigin: ToolOrigin;
    input: unknown;
  }
>;
export type ToolExecutionEndEvent = Base<
  'tool_execution_end',
  {
    toolCallId: string;
    toolName: string;
    status: 'ok' | 'error';
    output?: unknown;
    errorMessage?: string;
  }
>;
export type SubagentStartEvent = Base<
  'subagent_start',
  { subagentId: string; agentId: string; task: string }
>;
export type SubagentEndEvent = Base<
  'subagent_end',
  { subagentId: string; status: 'ok' | 'error' }
>;
export type SourcesEvent = Base<
  'sources',
  {
    sources: Array<{
      id: string;
      title: string;
      url?: string;
      documentId?: string;
    }>;
  }
>;
export type RichItemsEvent = Base<'rich_items', { items: unknown[] }>;
export type HeartbeatEvent = Base<'heartbeat', Record<string, never>>;

// -------------------------------------------------------------------- terminal
export interface GeneratedMediaV1 {
  readonly storageKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface TodoUpdateV1 {
  readonly taskPlanId?: string;
  readonly title: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  readonly order: number;
}

export interface UsageSummaryV1 {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

export interface CompletePayloadV1 {
  readonly schema: 'complete.v1';
  readonly status: 'completed' | 'completed_partial' | 'stopped';
  readonly response: {
    readonly text: string;
    readonly metadata: Record<string, unknown>;
  };
  readonly generatedMedia: readonly GeneratedMediaV1[];
  readonly webImageRefs: ReadonlyArray<{ url: string; sha256?: string }>;
  readonly todoUpdates: readonly TodoUpdateV1[];
  readonly suggestions: readonly string[];
  readonly usage: UsageSummaryV1 | null;
}

export interface InterruptActionRequestV1 {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly toolOrigin: ToolOrigin;
  readonly args: Record<string, unknown>;
  readonly description?: string;
}

export interface InterruptPayloadV1 {
  readonly schema: 'interrupt.v1';
  /** VARCHAR(255) id của LangGraph — KHÔNG phải UUID (§11). */
  readonly interruptId: string;
  readonly threadId: string;
  readonly partialText: string;
  readonly actionRequests: readonly InterruptActionRequestV1[];
  readonly deviceId: string | null;
  readonly deviceSessionId: string | null;
  readonly catalogVersion: string | null;
  readonly expiresInSeconds: number;
}

export interface ContinuationPayloadV1 {
  readonly schema: 'continuation_available.v1';
  readonly partialText: string;
  readonly reason:
    'execution_budget_exhausted' | 'planning_budget_reached' | 'approval_pause';
}

export interface ErrorPayloadV1 {
  readonly schema: 'error.v1';
  /** WorkflowErrorCode phía Python. */
  readonly code: string;
  readonly message: string;
  readonly partialText: string;
  readonly retryable: boolean;
}

export type CompleteEvent = Base<'complete', CompletePayloadV1>;
export type InterruptEvent = Base<'interrupt', InterruptPayloadV1>;
export type ContinuationAvailableEvent = Base<
  'continuation_available',
  ContinuationPayloadV1
>;
export type ErrorEvent = Base<'error', ErrorPayloadV1>;

export type V3TerminalEvent =
  CompleteEvent | InterruptEvent | ContinuationAvailableEvent | ErrorEvent;

export type V3StreamEvent =
  | RunStartEvent
  | AgentSelectedEvent
  | MessageDeltaEvent
  | ReasoningDeltaEvent
  | ToolExecutionStartEvent
  | ToolExecutionEndEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | SourcesEvent
  | RichItemsEvent
  | HeartbeatEvent
  | V3TerminalEvent;

export type V3EventType = V3StreamEvent['type'];

export const TERMINAL_EVENT_TYPES: ReadonlySet<V3EventType> =
  new Set<V3EventType>([
    'complete',
    'interrupt',
    'continuation_available',
    'error',
  ]);

export function isTerminalEvent(
  event: V3StreamEvent,
): event is V3TerminalEvent {
  return TERMINAL_EVENT_TYPES.has(event.type);
}
