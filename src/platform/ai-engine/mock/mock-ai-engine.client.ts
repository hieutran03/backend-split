import { createHash, randomUUID } from 'node:crypto';

import type {
  ContinueGenerationRequestV1,
  DeleteThreadsRequestV1,
  DocumentStatusCallbackV1,
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
import { V3_VERSION, type V3StreamEvent } from '@contracts/engine/v3-events';
import { NotFoundError } from '@shared/errors/app-error';
import type {
  ActorScope,
  AiEngineClient,
} from '@platform/ports/ai-engine.port';
import { parseScenario, type MockScenario } from './mock-scenario';

export interface MockAiEngineOptions {
  /** Độ trễ giữa 2 event (ms). 0 khi chạy unit test. */
  readonly delayMs: number;
  /**
   * URL gốc của chính backend để mock gọi callback B1 sau khi "index" xong.
   * Rỗng => không gọi callback (test tự kiểm qua `documentCallbacks`).
   */
  readonly backendCallbackBaseUrl: string;
  readonly serviceToken: string;
  /** Thời gian giả lập parse + index tài liệu (ms). */
  readonly indexDelayMs: number;
  readonly log?: (message: string, meta?: Record<string, unknown>) => void;
}

type ContentEvent = V3StreamEvent extends infer E
  ? E extends { type: infer T; data: infer D }
    ? { type: T; data: D }
    : never
  : never;

interface InflightTurn {
  stopRequested: boolean;
}

/**
 * AI Engine giả lập trong tiến trình — thay cho Engine Python khi dev.
 *
 * Mục tiêu: hành vi ĐÚNG HỢP ĐỒNG (seq tăng dần, đúng 1 terminal, heartbeat, stop
 * fence theo version, interrupt/continuation...) để backend code + test được mọi
 * nhánh của TurnOrchestrator mà không cần LLM. Nội dung câu trả lời là giả.
 *
 * Chọn kịch bản bằng marker trong message, xem `mock-scenario.ts`.
 */
export class MockAiEngineClient implements AiEngineClient {
  private readonly inflight = new Map<string, InflightTurn>();
  private readonly interrupts = new Map<
    string,
    { generationId: string; text: string }
  >();
  private readonly mcpServers = new Map<string, McpServerV1>([
    [
      'filesystem',
      {
        name: 'filesystem',
        transport: 'stdio',
        enabled: true,
        status: 'connected',
        toolCount: 2,
        config: { command: 'npx', env: { API_KEY: '***' } },
      },
    ],
    [
      'web-search',
      {
        name: 'web-search',
        transport: 'http',
        enabled: true,
        status: 'connected',
        toolCount: 1,
        config: {
          url: 'http://mock-mcp.local',
          headers: { Authorization: '***' },
        },
      },
    ],
  ]);
  private readonly mcpTools: McpToolV1[] = [
    {
      name: 'read_file',
      serverName: 'filesystem',
      description: 'Đọc một file (mock)',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    },
    {
      name: 'list_dir',
      serverName: 'filesystem',
      description: 'Liệt kê thư mục (mock)',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    },
    {
      name: 'search',
      serverName: 'web-search',
      description: 'Tìm kiếm web (mock)',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
    },
  ];
  /** Ghi lại callback B1 đã "gửi" — tiện cho test. */
  public readonly documentCallbacks: Array<{
    documentId: string;
    body: DocumentStatusCallbackV1;
  }> = [];
  /** Ghi lại mọi lời gọi side effect (E5/E8/E9) — tiện cho test outbox. */
  public readonly calls: Array<{ op: string; args: unknown }> = [];

  public constructor(private readonly options: MockAiEngineOptions) {}

  // =================================================================== E1–E4
  public startTurn(
    request: TurnRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent> {
    return this.runTurn(
      request.generationId,
      request.assistantMessageId,
      request.executionEpoch,
      request.checkpointThreadId,
      request.message,
      signal,
    );
  }

  public stopTurn(
    generationId: string,
    _request: StopTurnRequestV1,
  ): Promise<StopTurnResponseV1> {
    const turn = this.inflight.get(generationId);
    if (!turn) return Promise.resolve({ status: 'not_inflight' });
    turn.stopRequested = true;
    return Promise.resolve({ status: 'stop_requested' });
  }

  public resumeInterrupt(
    interruptId: string,
    request: ResumeInterruptRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent> {
    const approved = request.decisions.every((d) => d.decision !== 'reject');
    this.interrupts.delete(interruptId);
    const message = approved
      ? 'Đã được duyệt, tiếp tục thực thi tool [mock:tool]'
      : 'Người dùng từ chối tool, trả lời không dùng tool';
    return this.runTurn(
      request.generationId,
      request.assistantMessageId,
      1,
      request.threadId,
      message,
      signal,
    );
  }

  public continueGeneration(
    generationId: string,
    request: ContinueGenerationRequestV1,
    signal?: AbortSignal,
  ): AsyncIterable<V3StreamEvent> {
    return this.runTurn(
      generationId,
      request.assistantMessageId,
      request.executionEpoch,
      `continue:${request.continuationId}`,
      'Tiếp tục phần trả lời còn dở',
      signal,
    );
  }

  // ============================================================== E5, E8, E9
  public deleteThreads(
    request: DeleteThreadsRequestV1,
    idempotencyKey: string,
  ): Promise<void> {
    this.calls.push({ op: 'deleteThreads', args: { request, idempotencyKey } });
    this.log('E5 deleteThreads', { threads: request.threadIds.length });
    return Promise.resolve();
  }

  public indexDocument(
    documentId: string,
    request: IndexDocumentRequestV1,
    idempotencyKey: string,
  ): Promise<void> {
    this.calls.push({
      op: 'indexDocument',
      args: { documentId, request, idempotencyKey },
    });
    this.log('E8 indexDocument (mock) — sẽ callback B1', { documentId });
    // Giả lập Celery parse + index rồi callback B1. Tên file chứa "fail" => failed.
    const timer = setTimeout(() => {
      const failed = /fail/i.test(request.filename);
      const body: DocumentStatusCallbackV1 = failed
        ? {
            attemptId: request.attemptId,
            indexGenerationId: null,
            status: 'failed',
            failureCode: 'mock_parse_failed',
          }
        : {
            attemptId: request.attemptId,
            indexGenerationId: randomUUID(),
            status: 'ready',
          };
      void this.sendDocumentCallback(documentId, body);
    }, this.options.indexDelayMs);
    timer.unref();
    return Promise.resolve();
  }

  public deindexDocument(
    documentId: string,
    idempotencyKey: string,
  ): Promise<void> {
    this.calls.push({
      op: 'deindexDocument',
      args: { documentId, idempotencyKey },
    });
    return Promise.resolve();
  }

  // ================================================================== E6, E7
  public generateTitle(
    request: GenerateTitleRequestV1,
  ): Promise<GenerateTitleResponseV1> {
    const clean = parseScenario(request.message).cleanMessage;
    const words = clean.split(' ').filter(Boolean).slice(0, 6).join(' ');
    return Promise.resolve({
      title: words.length > 0 ? words : 'Cuộc trò chuyện mới',
    });
  }

  public generateTaskPlan(
    request: GenerateTaskPlanRequestV1,
  ): Promise<GenerateTaskPlanResponseV1> {
    const goal = parseScenario(request.goal).cleanMessage;
    return Promise.resolve({
      tasks: [
        { title: `Phân tích yêu cầu: ${goal}`, description: null, order: 1 },
        { title: 'Thu thập dữ liệu cần thiết', description: null, order: 2 },
        { title: 'Tổng hợp và trả lời', description: null, order: 3 },
      ],
    });
  }

  // ============================================================ E10–E12
  public getToolResult(
    blobId: string,
    scope: ActorScope,
  ): Promise<ToolResultV1> {
    return Promise.resolve({
      blobId,
      contentType: 'text/plain; charset=utf-8',
      content: `[mock] Nội dung tool result ${blobId} của user ${scope.userId}`,
    });
  }

  public getUsageDashboard(
    _scope: ActorScope,
    _query: { from?: string; to?: string },
  ): Promise<UsageDashboardV1> {
    return Promise.resolve(this.fakeUsage(12));
  }

  public getConversationUsage(
    _conversationId: string,
    _scope: ActorScope,
  ): Promise<UsageDashboardV1> {
    return Promise.resolve(this.fakeUsage(3));
  }

  // ============================================================ E13–E20
  public listMcpServers(_scope: ActorScope): Promise<McpServerV1[]> {
    return Promise.resolve([...this.mcpServers.values()]);
  }

  public addMcpServer(
    config: Record<string, unknown>,
    _scope: ActorScope,
  ): Promise<McpServerV1> {
    const name =
      typeof config.name === 'string'
        ? config.name
        : `server-${this.mcpServers.size + 1}`;
    const server: McpServerV1 = {
      name,
      transport: 'http',
      enabled: true,
      status: 'connected',
      toolCount: 0,
      config: { ...config, env: '***', headers: '***' },
    };
    this.mcpServers.set(name, server);
    return Promise.resolve(server);
  }

  public addMcpServerFromUrl(
    url: string,
    scope: ActorScope,
  ): Promise<McpServerV1> {
    return this.addMcpServer({ name: new URL(url).hostname, url }, scope);
  }

  public deleteMcpServer(name: string, _scope: ActorScope): Promise<void> {
    if (!this.mcpServers.delete(name)) throw new NotFoundError('mcp_server');
    return Promise.resolve();
  }

  public toggleMcpServer(
    name: string,
    enabled: boolean,
    _scope: ActorScope,
  ): Promise<McpServerV1> {
    const server = this.mcpServers.get(name);
    if (!server) throw new NotFoundError('mcp_server');
    const updated = { ...server, enabled };
    this.mcpServers.set(name, updated);
    return Promise.resolve(updated);
  }

  public listMcpTools(
    _scope: ActorScope,
    serverName?: string,
  ): Promise<McpToolV1[]> {
    return Promise.resolve(
      this.mcpTools.filter((t) => !serverName || t.serverName === serverName),
    );
  }

  public getMcpTool(
    toolName: string,
    _scope: ActorScope,
    serverName?: string,
  ): Promise<McpToolV1> {
    const tool = this.mcpTools.find(
      (t) =>
        t.name === toolName && (!serverName || t.serverName === serverName),
    );
    if (!tool) throw new NotFoundError('mcp_tool');
    return Promise.resolve(tool);
  }

  public async executeMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    scope: ActorScope,
    serverName?: string,
  ): Promise<unknown> {
    const tool = await this.getMcpTool(toolName, scope, serverName);
    return { tool: tool.name, args, result: `[mock] ${tool.name} OK` };
  }

  // ===================================================================== E21
  public health(_deep?: boolean): Promise<EngineHealthV1> {
    return Promise.resolve({
      status: 'ok',
      checks: {
        mode: { status: 'ok', detail: 'mock' },
        qdrant: { status: 'ok', detail: 'mock' },
        celery: { status: 'ok', detail: 'mock' },
      },
    });
  }

  // ================================================================ internals
  private async *runTurn(
    generationId: string,
    assistantMessageId: string,
    executionEpoch: number,
    checkpointThreadId: string,
    message: string,
    signal?: AbortSignal,
  ): AsyncGenerator<V3StreamEvent> {
    const scenario = parseScenario(message);
    const turn: InflightTurn = { stopRequested: false };
    this.inflight.set(generationId, turn);
    let seq = 0;
    const emit = (event: ContentEvent): V3StreamEvent => ({
      v: V3_VERSION,
      seq: ++seq,
      generationId,
      ts: new Date().toISOString(),
      ...event,
    });
    const delay = scenario.slow
      ? this.options.delayMs * 10
      : this.options.delayMs;
    let text = '';

    try {
      yield emit({
        type: 'run_start',
        data: { executionEpoch, checkpointThreadId },
      });
      await this.sleep(delay, signal);
      yield emit({
        type: 'agent_selected',
        data: { agentId: scenario.withTool ? 'search_agent' : 'chat_agent' },
      });

      if (scenario.withReasoning) {
        for (const delta of ['Đang suy nghĩ ', 'về câu hỏi... ']) {
          await this.sleep(delay, signal);
          yield emit({
            type: 'reasoning_delta',
            data: { messageId: assistantMessageId, delta },
          });
        }
      }

      if (scenario.withSubagent) {
        const subagentId = randomUUID();
        yield emit({
          type: 'subagent_start',
          data: {
            subagentId,
            agentId: 'planning_worker',
            task: 'Nghiên cứu phụ',
          },
        });
        await this.sleep(delay, signal);
        yield emit({
          type: 'subagent_end',
          data: { subagentId, status: 'ok' },
        });
      }

      if (scenario.withTool) {
        const toolCallId = `call_${randomUUID().slice(0, 8)}`;
        yield emit({
          type: 'tool_execution_start',
          data: {
            toolCallId,
            toolName: 'search',
            toolOrigin: 'mcp',
            input: { query: scenario.cleanMessage },
          },
        });
        await this.sleep(delay * 3, signal);
        yield emit({
          type: 'tool_execution_end',
          data: {
            toolCallId,
            toolName: 'search',
            status: 'ok',
            output: { hits: 3 },
          },
        });
      }

      const tokens = this.answerTokens(scenario);
      const cutAt =
        scenario.terminal === 'complete'
          ? tokens.length
          : Math.ceil(tokens.length / 2);
      for (let i = 0; i < cutAt; i++) {
        if (turn.stopRequested) break;
        await this.sleep(delay, signal);
        const delta = tokens[i] ?? '';
        text += delta;
        yield emit({
          type: 'message_delta',
          data: { messageId: assistantMessageId, delta },
        });
        // Heartbeat giả lập mỗi 10 token để consumer test được nhánh heartbeat.
        if (i > 0 && i % 10 === 0) yield emit({ type: 'heartbeat', data: {} });
      }

      if (turn.stopRequested) {
        yield emit({
          type: 'complete',
          data: this.completePayload(text, scenario, 'stopped'),
        });
        return;
      }

      switch (scenario.terminal) {
        case 'disconnect':
          // Cố tình kết thúc stream không có terminal.
          return;
        case 'error':
          yield emit({
            type: 'error',
            data: {
              schema: 'error.v1',
              code: 'mock_failure',
              message: 'Lỗi giả lập từ mock AI Engine',
              partialText: text,
              retryable: true,
            },
          });
          return;
        case 'interrupt': {
          const interruptId = `mock-interrupt-${randomUUID()}`;
          this.interrupts.set(interruptId, { generationId, text });
          yield emit({
            type: 'interrupt',
            data: {
              schema: 'interrupt.v1',
              interruptId,
              threadId: checkpointThreadId,
              partialText: text,
              actionRequests: [
                {
                  toolCallId: `call_${randomUUID().slice(0, 8)}`,
                  toolName: 'run_shell',
                  toolOrigin: 'client',
                  args: { command: 'ls -la' },
                  description: 'Chạy lệnh trên máy người dùng (cần duyệt)',
                },
              ],
              deviceId: null,
              deviceSessionId: null,
              catalogVersion: null,
              expiresInSeconds: 900,
            },
          });
          return;
        }
        case 'continuation':
          yield emit({
            type: 'continuation_available',
            data: {
              schema: 'continuation_available.v1',
              partialText: text,
              reason: 'execution_budget_exhausted',
            },
          });
          return;
        case 'complete':
          if (scenario.withSources) {
            yield emit({
              type: 'sources',
              data: {
                sources: [
                  {
                    id: 's1',
                    title: 'Nguồn giả lập',
                    url: 'https://example.com/mock',
                  },
                ],
              },
            });
          }
          yield emit({
            type: 'complete',
            data: this.completePayload(text, scenario, 'completed'),
          });
          return;
      }
    } finally {
      this.inflight.delete(generationId);
    }
  }

  private completePayload(
    text: string,
    scenario: MockScenario,
    status: 'completed' | 'stopped',
  ): Extract<V3StreamEvent, { type: 'complete' }>['data'] {
    const sha = createHash('sha256').update(text).digest('hex');
    return {
      schema: 'complete.v1',
      status,
      response: { text, metadata: { mock: true } },
      generatedMedia: scenario.withMedia
        ? [
            {
              storageKey: `chat-images/${sha.slice(0, 2)}/${sha}.png`,
              sha256: sha,
              mimeType: 'image/png',
              sizeBytes: 1024,
            },
          ]
        : [],
      webImageRefs: [],
      todoUpdates: scenario.withTodos
        ? [
            { title: 'Bước 1 (mock)', status: 'completed', order: 1 },
            { title: 'Bước 2 (mock)', status: 'pending', order: 2 },
          ]
        : [],
      suggestions: ['Bạn có thể giải thích thêm?', 'Cho ví dụ cụ thể?'],
      usage: {
        inputTokens: Math.ceil(scenario.cleanMessage.length / 4),
        outputTokens: Math.ceil(text.length / 4),
        model: 'mock-model',
      },
    };
  }

  private answerTokens(scenario: MockScenario): string[] {
    const base = `Đây là câu trả lời giả lập từ mock AI Engine cho: "${scenario.cleanMessage || '(trống)'}". `;
    const body = scenario.long
      ? base + 'Nội dung dài để kiểm tra stream, lease và nút Stop. '.repeat(20)
      : base + 'Khi có AI Engine thật, đặt AI_ENGINE_MODE=http.';
    return body.match(/\S+\s*/g) ?? [body];
  }

  private fakeUsage(requests: number): UsageDashboardV1 {
    return {
      totals: {
        inputTokens: requests * 120,
        outputTokens: requests * 340,
        requests,
      },
      byModel: [
        {
          model: 'mock-model',
          inputTokens: requests * 120,
          outputTokens: requests * 340,
          requests,
        },
      ],
    };
  }

  private async sendDocumentCallback(
    documentId: string,
    body: DocumentStatusCallbackV1,
  ): Promise<void> {
    this.documentCallbacks.push({ documentId, body });
    if (!this.options.backendCallbackBaseUrl) return;
    const url = `${this.options.backendCallbackBaseUrl}/internal/v1/documents/${documentId}/status`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.serviceToken}`,
        },
        body: JSON.stringify(body),
      });
      this.log('B1 callback (mock) sent', {
        documentId,
        status: response.status,
      });
    } catch (error) {
      this.log('B1 callback (mock) failed', {
        documentId,
        error: String(error),
      });
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  }

  private log(message: string, meta?: Record<string, unknown>): void {
    this.options.log?.(`[mock-engine] ${message}`, meta);
  }
}
