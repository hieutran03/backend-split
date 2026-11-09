import { randomUUID } from 'node:crypto';

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
import { AppError, UpstreamError } from '@shared/errors/app-error';
import type {
  ActorScope,
  AiEngineClient,
} from '@platform/ports/ai-engine.port';
import { readNdjson } from './ndjson';

export interface HttpAiEngineOptions {
  readonly baseUrl: string;
  readonly serviceToken: string;
  /** Timeout cho call JSON (không áp cho stream). */
  readonly timeoutMs: number;
  /** Lấy request id hiện hành để truyền X-Request-Id. */
  readonly requestId?: () => string | undefined;
}

type Method = 'GET' | 'POST' | 'DELETE';

/**
 * Adapter gọi AI Engine thật qua /internal/v1 (§8).
 *
 * TODO(ENG-03): retry/backoff cho call idempotent, circuit breaker, timeout "im
 * lặng" cho stream (5 s × 3), metrics. Bản này đủ để chạy end-to-end.
 */
export class HttpAiEngineClient implements AiEngineClient {
  public constructor(private readonly options: HttpAiEngineOptions) {}

  // ---------------------------------------------------------------- streams
  public startTurn(
    request: TurnRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent> {
    return this.stream('/internal/v1/turns', request, signal);
  }

  public resumeInterrupt(
    interruptId: string,
    request: ResumeInterruptRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent> {
    return this.stream(
      `/internal/v1/interrupts/${enc(interruptId)}/resume`,
      request,
      signal,
    );
  }

  public continueGeneration(
    generationId: string,
    request: ContinueGenerationRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent> {
    return this.stream(
      `/internal/v1/generations/${enc(generationId)}/continue`,
      request,
      signal,
    );
  }

  public stopTurn(
    generationId: string,
    request: StopTurnRequestV1,
  ): Promise<StopTurnResponseV1> {
    return this.json(
      'POST',
      `/internal/v1/turns/${enc(generationId)}/stop`,
      request,
    );
  }

  // ----------------------------------------------------------- side effects
  public async deleteThreads(
    request: DeleteThreadsRequestV1,
    idempotencyKey: string,
  ): Promise<void> {
    await this.json('POST', '/internal/v1/threads/delete', request, {
      idempotencyKey,
    });
  }

  public async indexDocument(
    documentId: string,
    request: IndexDocumentRequestV1,
    idempotencyKey: string,
  ): Promise<void> {
    await this.json(
      'POST',
      `/internal/v1/documents/${enc(documentId)}/index`,
      request,
      { idempotencyKey },
    );
  }

  public async deindexDocument(
    documentId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.json(
      'DELETE',
      `/internal/v1/documents/${enc(documentId)}/index`,
      undefined,
      { idempotencyKey },
    );
  }

  // ------------------------------------------------------------------- LLM
  public generateTitle(
    request: GenerateTitleRequestV1,
  ): Promise<GenerateTitleResponseV1> {
    return this.json('POST', '/internal/v1/titles', request);
  }

  public generateTaskPlan(
    request: GenerateTaskPlanRequestV1,
  ): Promise<GenerateTaskPlanResponseV1> {
    return this.json('POST', '/internal/v1/task-plans/generate', request);
  }

  // ------------------------------------------------------------------ reads
  public getToolResult(
    blobId: string,
    scope: ActorScope,
  ): Promise<ToolResultV1> {
    return this.json(
      'GET',
      `/internal/v1/tool-results/${enc(blobId)}`,
      undefined,
      { scope },
    );
  }

  public getUsageDashboard(
    scope: ActorScope,
    query: { from?: string; to?: string },
  ): Promise<UsageDashboardV1> {
    const qs = new URLSearchParams();
    if (query.from) qs.set('from', query.from);
    if (query.to) qs.set('to', query.to);
    return this.json(
      'GET',
      `/internal/v1/usage/dashboard?${qs.toString()}`,
      undefined,
      { scope },
    );
  }

  public getConversationUsage(
    conversationId: string,
    scope: ActorScope,
  ): Promise<UsageDashboardV1> {
    return this.json(
      'GET',
      `/internal/v1/usage/conversations/${enc(conversationId)}`,
      undefined,
      { scope },
    );
  }

  // -------------------------------------------------------------------- MCP
  public listMcpServers(scope: ActorScope): Promise<McpServerV1[]> {
    return this.json('GET', '/internal/v1/mcp/servers', undefined, { scope });
  }
  public addMcpServer(
    config: Record<string, unknown>,
    scope: ActorScope,
  ): Promise<McpServerV1> {
    return this.json('POST', '/internal/v1/mcp/servers', config, { scope });
  }
  public addMcpServerFromUrl(
    url: string,
    scope: ActorScope,
  ): Promise<McpServerV1> {
    return this.json(
      'POST',
      '/internal/v1/mcp/servers/from-url',
      { url },
      { scope },
    );
  }
  public async deleteMcpServer(name: string, scope: ActorScope): Promise<void> {
    await this.json(
      'DELETE',
      `/internal/v1/mcp/servers/${enc(name)}`,
      undefined,
      { scope },
    );
  }
  public toggleMcpServer(
    name: string,
    enabled: boolean,
    scope: ActorScope,
  ): Promise<McpServerV1> {
    return this.json(
      'POST',
      `/internal/v1/mcp/servers/${enc(name)}/toggle`,
      { enabled },
      { scope },
    );
  }
  public listMcpTools(
    scope: ActorScope,
    serverName?: string,
  ): Promise<McpToolV1[]> {
    const qs = serverName ? `?serverName=${enc(serverName)}` : '';
    return this.json('GET', `/internal/v1/mcp/tools${qs}`, undefined, {
      scope,
    });
  }
  public getMcpTool(
    toolName: string,
    scope: ActorScope,
    serverName?: string,
  ): Promise<McpToolV1> {
    const qs = serverName ? `?serverName=${enc(serverName)}` : '';
    return this.json(
      'GET',
      `/internal/v1/mcp/tools/${enc(toolName)}${qs}`,
      undefined,
      { scope },
    );
  }
  public executeMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    scope: ActorScope,
    serverName?: string,
  ): Promise<unknown> {
    return this.json(
      'POST',
      `/internal/v1/mcp/tools/${enc(toolName)}/execute`,
      { args, serverName },
      { scope },
    );
  }

  public health(deep = false): Promise<EngineHealthV1> {
    return this.json('GET', `/internal/v1/health${deep ? '?deep=true' : ''}`);
  }

  // ============================================================== internals
  private headers(extra?: {
    idempotencyKey?: string;
    scope?: ActorScope;
  }): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.serviceToken}`,
      'x-request-id': this.options.requestId?.() ?? randomUUID(),
      'content-type': 'application/json',
    };
    if (extra?.idempotencyKey)
      headers['idempotency-key'] = extra.idempotencyKey;
    if (extra?.scope) {
      headers['x-actor-user-id'] = extra.scope.userId;
      headers['x-actor-is-admin'] = String(extra.scope.isAdmin);
    }
    return headers;
  }

  private async json<T>(
    method: Method,
    path: string,
    body?: unknown,
    extra?: { idempotencyKey?: string; scope?: ActorScope },
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.options.baseUrl + path, {
        method,
        headers: this.headers(extra),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new UpstreamError(
        `AI Engine unreachable: ${String(error)}`,
        'engine_unavailable',
      );
    }
    if (!response.ok) await this.raise(response, path);
    if (response.status === 202 || response.status === 204)
      return undefined as T;
    return (await response.json()) as T;
  }

  private async *stream(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): AsyncGenerator<V3StreamEvent> {
    let response: Response;
    try {
      response = await fetch(this.options.baseUrl + path, {
        method: 'POST',
        headers: { ...this.headers(), accept: 'application/x-ndjson' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new UpstreamError(
        `AI Engine unreachable: ${String(error)}`,
        'engine_unavailable',
      );
    }
    if (!response.ok) await this.raise(response, path);
    if (!response.body)
      throw new UpstreamError(
        'AI Engine returned empty stream',
        'engine_disconnect',
      );
    yield* readNdjson<V3StreamEvent>(response.body);
  }

  private async raise(response: Response, path: string): Promise<never> {
    const text = await response.text().catch(() => '');
    // 404/409 từ Engine giữ nguyên ngữ nghĩa để caller quyết định (outbox §8).
    if (response.status === 404)
      throw new AppError(
        'not_found',
        'Engine resource not found',
        'engine_not_found',
      );
    if (response.status === 409)
      throw new AppError('conflict', 'Engine conflict', 'engine_conflict', {
        body: text,
      });
    throw new UpstreamError(
      `AI Engine ${response.status} on ${path}`,
      'engine_error',
      {
        status: response.status,
        body: text.slice(0, 500),
      },
    );
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
