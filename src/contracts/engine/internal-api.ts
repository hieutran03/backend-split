/**
 * Bodies/responses of /internal/v1 (§8). The Engine does NOT receive the user JWT: userId is
 * data asserted by the backend after it has checked ownership.
 *
 * ⚠️ DRAFT — reconcile with `app/schemas/workflow.py` (WorkflowExecutionRequest)
 * and apis/ai-engine-internal-api.md (task ENG-01) before freezing.
 */

/** E1 POST /internal/v1/turns */
export interface TurnRequestV1 {
  readonly generationId: string;
  readonly generationVersion: number;
  readonly executionEpoch: number;
  readonly conversationId: string;
  readonly userId: string;
  readonly userMessageId: string;
  /** Pre-reserved UUID; = messageId in the AI SDK stream. FK is set only once the row exists (R19). */
  readonly assistantMessageId: string;
  readonly checkpointThreadId: string;
  readonly message: string;
  readonly persona: string | null;
  readonly attachments: ReadonlyArray<{
    readonly chatImageId?: string;
    readonly storageKey?: string;
    readonly dataBase64?: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  }>;
  readonly modelRequest: Record<string, unknown> | null;
  /** Phase 5. */
  readonly modelRuntime: Record<string, unknown> | null;
  /** Phase 5. */
  readonly historyHint: ReadonlyArray<{
    sender: 'user' | 'assistant';
    content: string;
  }> | null;
  readonly documents: ReadonlyArray<{
    documentId: string;
    filename: string;
    status: 'processing' | 'ready' | 'failed';
  }>;
  readonly projectId: string | null;
  readonly projectInstructions: string | null;
  readonly planning: {
    readonly planningModeEnabled: boolean;
    readonly tasks: readonly unknown[];
  };
  readonly customAgents: Record<string, unknown>;
  readonly hitlPolicy: { readonly clientRules: Record<string, unknown> };
  readonly deviceId: string | null;
  readonly deviceSessionId: string | null;
  readonly inlineRichResponseV1: boolean;
}

/** E2 POST /internal/v1/turns/{generationId}/stop */
export interface StopTurnRequestV1 {
  readonly version: number;
  readonly reason: 'user_stop' | 'lease_expired' | 'conversation_deleted';
}
export interface StopTurnResponseV1 {
  readonly status: 'stop_requested' | 'not_inflight';
}

/** E3 POST /internal/v1/interrupts/{interruptId}/resume */
export interface ResumeInterruptRequestV1 {
  readonly generationId: string;
  readonly generationVersion: number;
  readonly userId: string;
  readonly conversationId: string;
  readonly threadId: string;
  readonly assistantMessageId: string;
  readonly decisions: ReadonlyArray<{
    readonly toolCallId: string;
    readonly decision: 'approve' | 'reject' | 'edit';
    readonly editedArgs?: Record<string, unknown>;
    readonly message?: string;
  }>;
}

/** E4 POST /internal/v1/generations/{generationId}/continue */
export interface ContinueGenerationRequestV1 {
  readonly generationVersion: number;
  readonly executionEpoch: number;
  readonly userId: string;
  readonly conversationId: string;
  readonly continuationId: string;
  readonly assistantMessageId: string;
}

/** E5 POST /internal/v1/threads/delete */
export interface DeleteThreadsRequestV1 {
  readonly conversationId: string;
  readonly threadIds: readonly string[];
  readonly reason: 'conversation_deleted' | 'interrupt_expired';
}

/** E6 POST /internal/v1/titles */
export interface GenerateTitleRequestV1 {
  readonly userId: string;
  readonly conversationId: string | null;
  readonly message: string;
}
export interface GenerateTitleResponseV1 {
  readonly title: string;
}

/** E7 POST /internal/v1/task-plans/generate */
export interface GenerateTaskPlanRequestV1 {
  readonly userId: string;
  readonly conversationId: string;
  readonly goal: string;
}
export interface GenerateTaskPlanResponseV1 {
  readonly tasks: ReadonlyArray<{
    title: string;
    description: string | null;
    order: number;
  }>;
}

/** E8 POST /internal/v1/documents/{documentId}/index — 202 */
export interface IndexDocumentRequestV1 {
  readonly attemptId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: string;
}

/** B1 POST /internal/v1/documents/{documentId}/status — the Engine calls BACK into the backend. */
export interface DocumentStatusCallbackV1 {
  readonly attemptId: string;
  readonly indexGenerationId: string | null;
  readonly status: 'ready' | 'failed';
  readonly failureCode?: string;
}

/** E10 GET /internal/v1/tool-results/{blobId} */
export interface ToolResultV1 {
  readonly blobId: string;
  readonly contentType: string;
  readonly content: string;
}

/** E11 / E12 */
export interface UsageDashboardV1 {
  readonly totals: {
    inputTokens: number;
    outputTokens: number;
    requests: number;
  };
  readonly byModel: ReadonlyArray<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    requests: number;
  }>;
}

/** E13–E20 */
export interface McpServerV1 {
  readonly name: string;
  readonly transport: 'stdio' | 'http' | 'sse';
  readonly enabled: boolean;
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly toolCount: number;
  /** env/headers are always masked (***) before being returned. */
  readonly config: Record<string, unknown>;
}
export interface McpToolV1 {
  readonly name: string;
  readonly serverName: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** E21 GET /internal/v1/health */
export type HealthStatus = 'ok' | 'degraded' | 'down';
export interface EngineHealthV1 {
  readonly status: HealthStatus;
  readonly checks: Record<string, { status: HealthStatus; detail?: string }>;
}
