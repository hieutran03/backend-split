import type {
  ContinueGenerationRequestV1,
  DeleteThreadsRequestV1,
  EngineHealthV1,
  GenerateTaskPlanRequestV1,
  GenerateTaskPlanResponseV1,
  GenerateTitleRequestV1,
  GenerateTitleResponseV1,
  IndexDocumentRequestV1,
  McpServerV1,
  McpToolV1,
  ResumeInterruptRequestV1,
  StopTurnRequestV1,
  StopTurnResponseV1,
  ToolResultV1,
  TurnRequestV1,
  UsageDashboardV1,
} from '@contracts/engine/internal-api';
import type { V3StreamEvent } from '@contracts/engine/v3-events';

/** Scope/actor asserted by the backend — the Engine must check row ownership itself (§8). */
export interface ActorScope {
  readonly userId: string;
  readonly isAdmin: boolean;
}

/**
 * The single port for talking to the AI Engine (/internal/v1, E1–E21).
 *
 * Two adapters (selected by AI_ENGINE_MODE):
 *  - `MockAiEngineClient` (mock): in-process simulation, used for dev/test.
 *  - `HttpAiEngineClient` (http): calls the real Python Engine, streams NDJSON.
 *
 * Streams return an AsyncIterable, cancelled via AbortSignal. Note D5: an HTTP client
 * disconnecting must NOT cancel this stream; only an explicit Stop (E2) cancels a turn.
 */
export interface AiEngineClient {
  // ---- chat turns (NDJSON V3 stream) ----
  /** E1 */
  startTurn(
    request: TurnRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent>;
  /** E2 */
  stopTurn(
    generationId: string,
    request: StopTurnRequestV1,
  ): Promise<StopTurnResponseV1>;
  /** E3 */
  resumeInterrupt(
    interruptId: string,
    request: ResumeInterruptRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent>;
  /** E4 */
  continueGeneration(
    generationId: string,
    request: ContinueGenerationRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent>;

  // ---- side effects, called only from the outbox publisher ----
  /** E5 */
  deleteThreads(
    request: DeleteThreadsRequestV1,
    idempotencyKey: string,
  ): Promise<void>;
  /** E8 */
  indexDocument(
    documentId: string,
    request: IndexDocumentRequestV1,
    idempotencyKey: string,
  ): Promise<void>;
  /** E9 */
  deindexDocument(documentId: string, idempotencyKey: string): Promise<void>;

  // ---- small LLM calls ----
  /** E6 */
  generateTitle(
    request: GenerateTitleRequestV1,
  ): Promise<GenerateTitleResponseV1>;
  /** E7 */
  generateTaskPlan(
    request: GenerateTaskPlanRequestV1,
  ): Promise<GenerateTaskPlanResponseV1>;

  // ---- reading Engine-owned data ----
  /** E10 */
  getToolResult(blobId: string, scope: ActorScope): Promise<ToolResultV1>;
  /** E11 */
  getUsageDashboard(
    scope: ActorScope,
    query: { from?: string; to?: string },
  ): Promise<UsageDashboardV1>;
  /** E12 */
  getConversationUsage(
    conversationId: string,
    scope: ActorScope,
  ): Promise<UsageDashboardV1>;

  // ---- MCP (E13–E20) ----
  listMcpServers(scope: ActorScope): Promise<McpServerV1[]>;
  addMcpServer(
    config: Record<string, unknown>,
    scope: ActorScope,
  ): Promise<McpServerV1>;
  addMcpServerFromUrl(url: string, scope: ActorScope): Promise<McpServerV1>;
  deleteMcpServer(name: string, scope: ActorScope): Promise<void>;
  toggleMcpServer(
    name: string,
    enabled: boolean,
    scope: ActorScope,
  ): Promise<McpServerV1>;
  listMcpTools(scope: ActorScope, serverName?: string): Promise<McpToolV1[]>;
  getMcpTool(
    toolName: string,
    scope: ActorScope,
    serverName?: string,
  ): Promise<McpToolV1>;
  executeMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    scope: ActorScope,
    serverName?: string,
  ): Promise<unknown>;

  /** E21 */
  health(deep?: boolean): Promise<EngineHealthV1>;
}

export const AI_ENGINE_CLIENT = Symbol('AI_ENGINE_CLIENT');
