/**
 * Bodies/responses of the Engine's /internal/v1 (§8), called BY the backend. The Engine
 * does NOT receive the user JWT: userId is data asserted by the backend after it has
 * checked ownership.
 *
 * The backend and the Engine own separate databases (docs/integration.md): everything a
 * turn needs from backend data travels in the request (E1/E3/E4) or is pulled through
 * the backend's internal API (src/contracts/backend/internal-api.ts); side effects travel
 * as events (src/contracts/events/).
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
  /**
   * Resolved models + DECRYPTED provider credentials for this turn (C2). The Engine
   * has no access to model_providers / agent_model_configs / server_secrets any more.
   */
  readonly modelRuntime: ModelRuntimeV1;
  /**
   * C1: the Engine loads prompt history itself through B2 (messages after its own
   * memory cursor, up to `throughSequence` = the sequence just before this turn's
   * user message). It never reads the messages table.
   */
  readonly history: { readonly throughSequence: number };
  /**
   * Every document the turn may route to or retrieve from (C3, C4). RAG scopes its
   * chunk queries to these ids instead of joining documents/conversations.
   */
  readonly documents: ReadonlyArray<{
    documentId: string;
    filename: string;
    status: 'processing' | 'ready' | 'failed';
  }>;
  readonly projectId: string | null;
  readonly projectInstructions: string | null;
  /** The Engine used to read conversations.planning_mode_enabled / plan_lifecycle and task_plans. */
  readonly planning: {
    readonly planningModeEnabled: boolean;
    /** conversations.plan_lifecycle as stored (null = never planned). */
    readonly planLifecycle: string | null;
    readonly tasks: readonly unknown[];
  };
  readonly customAgents: Record<string, unknown>;
  readonly hitlPolicy: { readonly clientRules: Record<string, unknown> };
  readonly deviceId: string | null;
  readonly deviceSessionId: string | null;
  readonly inlineRichResponseV1: boolean;
  readonly answerVisualsV1: boolean;
  readonly sourceFiguresV1: boolean;
}

/**
 * One resolved model (backend-proposed shape — reconcile with Python
 * ModelConfigService in ENG-01). `credential: null` ⇒ the Engine uses its own
 * server default key (e.g. title generation).
 */
export interface ResolvedModelV1 {
  readonly providerType: string;
  readonly model: string;
  readonly temperature: number | null;
  readonly reasoningEffort: string | null;
  readonly credential: {
    readonly apiKey: string;
    readonly baseUrl: string | null;
  } | null;
}

/**
 * Models per agent key (Python AGENT_CONFIG keys) for one user. Carried by E1/E3/E4
 * and returned by B4. Contains secrets: never log it, never persist it.
 */
export interface ModelRuntimeV1 {
  readonly agents: Readonly<Record<string, ResolvedModelV1>>;
}

/**
 * Rich-response capabilities of one turn, sent ALREADY EFFECTIVE (Python
 * `effective_answer_visuals` / `effective_source_figures`, 26/10): a feature is
 * true only when the client asked for it, `inlineRichResponseV1` is true and the
 * server switch INLINE_RICH_RESPONSE_ENABLED is on. E1 carries the same fields.
 */
export interface RichCapabilitiesV1 {
  readonly inlineRichResponseV1: boolean;
  readonly answerVisualsV1: boolean;
  readonly sourceFiguresV1: boolean;
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
export interface ResumeInterruptRequestV1 extends RichCapabilitiesV1 {
  readonly generationId: string;
  readonly generationVersion: number;
  readonly userId: string;
  readonly conversationId: string;
  readonly threadId: string;
  readonly assistantMessageId: string;
  readonly modelRuntime: ModelRuntimeV1;
  readonly decisions: ReadonlyArray<{
    readonly toolCallId: string;
    readonly decision: 'approve' | 'reject' | 'edit';
    readonly editedArgs?: Record<string, unknown>;
    readonly message?: string;
  }>;
}

/** E4 POST /internal/v1/generations/{generationId}/continue */
export interface ContinueGenerationRequestV1 extends RichCapabilitiesV1 {
  readonly generationVersion: number;
  readonly executionEpoch: number;
  readonly userId: string;
  readonly conversationId: string;
  readonly continuationId: string;
  readonly assistantMessageId: string;
  readonly modelRuntime: ModelRuntimeV1;
}

/*
 * E5 (threads/delete), E8 (documents/{id}/index), E9 (DELETE .../index) and the
 * callback B1 (documents/{id}/status) are gone: they are integration events now —
 * conversation.deleted / interrupt.expired, document.uploaded, document.deleted
 * (src/contracts/events/backend-events.ts) and document.processing_status_changed
 * (src/contracts/events/engine-events.ts).
 */

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

/** E10 GET /internal/v1/tool-results/{blobId} */
export interface ToolResultV1 {
  readonly blobId: string;
  readonly contentType: string;
  readonly content: string;
}

/**
 * E11 / E12. Usage rows keep plain user/conversation ids (no FK to backend tables any
 * more): anything per conversation is returned by id only, and the backend adds the
 * titles and drops deleted conversations from its own data.
 */
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
