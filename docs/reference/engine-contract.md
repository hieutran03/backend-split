# Hợp đồng với AI Engine (/internal/v1)

Nguồn: tài liệu Backend Split §8, §7, §11. Code: [src/contracts/engine/](../../src/contracts/engine/),
port [src/platform/ports/ai-engine.port.ts](../../src/platform/ports/ai-engine.port.ts).

> ⚠️ Kiểu trong `src/contracts/engine/*` đang là **DRAFT** suy ra từ tài liệu. Task **ENG-01**
> đối chiếu với `app/schemas/workflow.py` và `app/services/event_streaming/events.py` của repo
> chatbot rồi mới freeze.

## Quy tắc chung

- Chỉ mạng nội bộ. `Authorization: Bearer <service-token>` + `X-Request-Id`.
- Engine **không bao giờ** nhận JWT user. `userId` trong body là khẳng định của backend sau khi kiểm ownership.
- Stream: `application/x-ndjson`, mỗi dòng một `V3StreamEvent`, heartbeat 5 s, **đúng một** sự kiện cuối
  (`complete | interrupt | continuation_available | error`).
- Im lặng > 5 s × 3 ⇒ coi như đứt: ghi partial message `stop_reason=engine_disconnect`, generation `failed`.
- E10/E11/E12/MCP execute: backend gửi actor scope, Engine tự kiểm owner của row.

## Endpoint

| # | Method | Path | Kiểu | Backend gọi khi | Method trên `AiEngineClient` |
|---|---|---|---|---|---|
| E1 | POST | /internal/v1/turns | NDJSON | Lượt chat mới | `startTurn` |
| E2 | POST | /internal/v1/turns/{generationId}/stop | JSON | Stop / lease reaper / xoá hội thoại | `stopTurn` |
| E3 | POST | /internal/v1/interrupts/{interruptId}/resume | NDJSON | HITL resume | `resumeInterrupt` |
| E4 | POST | /internal/v1/generations/{generationId}/continue | NDJSON | Continue sau hết budget | `continueGeneration` |
| E5 | POST | /internal/v1/threads/delete | JSON | outbox conversation.deleted, interrupt.expired | `deleteThreads` |
| E6 | POST | /internal/v1/titles | JSON | Sinh tiêu đề | `generateTitle` |
| E7 | POST | /internal/v1/task-plans/generate | JSON | Sinh task plan | `generateTaskPlan` |
| E8 | POST | /internal/v1/documents/{documentId}/index | 202 | outbox document.uploaded | `indexDocument` |
| E9 | DELETE | /internal/v1/documents/{documentId}/index | JSON | outbox document.deleted | `deindexDocument` |
| E10 | GET | /internal/v1/tool-results/{blobId} | raw | GET /api/v1/tool-results/{id} | `getToolResult` |
| E11 | GET | /internal/v1/usage/dashboard | JSON | Dashboard usage | `getUsageDashboard` |
| E12 | GET | /internal/v1/usage/conversations/{id} | JSON | Usage theo hội thoại | `getConversationUsage` |
| E13–E20 | * | /internal/v1/mcp/... | JSON | /api/v1/mcp-*; E18 validate custom agent | `*Mcp*` |
| E21 | GET | /internal/v1/health | JSON | /api/v1/health/dependencies | `health` |
| **B1** | POST | /internal/v1/documents/{documentId}/status | JSON | **Engine gọi backend** sau parse/index | (controller của module documents) |

## Outbox → internal call

| event_type | Ghi khi | Gọi |
|---|---|---|
| conversation.deleted | soft delete hội thoại | E2 (nếu còn lượt active) rồi E5 với threadIds = generations.checkpoint_thread_id ∪ hitl_interrupts.thread_id |
| conversation.forked | fork hội thoại | Engine tạo job tóm tắt cho hội thoại con |
| project.deleted | xoá project | Engine xoá mềm user_memories của project (C19) |
| message.mutated | sửa/xoá message | Engine invalidate summaries/jobs (C19) |
| document.uploaded | upload | E8 |
| document.deleted | xoá tài liệu | E9, sau đó xoá object S3 |
| interrupt.expired | sweep mỗi phút | E5 |
| generation.lease_expired | lease reaper | E2 reason=lease_expired |

Dispatch: `Idempotency-Key = outbox_events.id`; backoff 5 s × 2ⁿ, tối đa 10 phút, ≤ 12 lần rồi `failed`.
404/409 chỉ coi là thành công khi contract nói rõ trạng thái đích đã đạt (409 ở E9 do đang index = retry).

## Quyết định phải nhớ (D*)

- **D1** seam = MessageService; vào `WorkflowExecutionRequest`, ra `V3StreamEvent`.
- **D2** Backend chiếu V3 sang cả SSE nội bộ và AI SDK v6; Engine chỉ nói V3.
- **D3** Backend giữ khoá lượt và row `generations`; Engine không bao giờ khoá.
- **D4/D5** Lease 30 s gia hạn mỗi 10 s; client ngắt **không** huỷ lượt (cần chốt lại với FE — code Python hiện vẫn huỷ).
- **D6** Persist trước, forward sau.
- **D7** Device dispatch qua Redis, key `client-runtime:*` không đổi; WS gateway về backend.
- **D8** Media + upload lên object storage trước khi tách.
- **D9/D10** Outbox cho side effect chéo miền; schema chỉ thêm khi còn chung DB.
- **D15** Không sở hữu = 404, không phải 403.
- **D19** Chấp nhận access token cũ (không `type`) tới hạn; refresh JWT cũ đổi được 1 lần trong 7 ngày.
- **D23** `stream` trong body + `protocol=sse|ai-sdk` trong query.
- **D24** Xoá hội thoại đang có lượt active ⇒ 409.

## Chi tiết dễ trượt khi port (§11)

- **Khoá lượt**: `pg_try_advisory_xact_lock(key)` sau `SET LOCAL idle_in_transaction_session_timeout = 0`;
  key = 8 byte đầu của `sha256(str(conversation_id))`, big-endian, ép int64 có dấu; poll 50 ms tới 30 s;
  một connection riêng giữ transaction suốt lượt; release = đóng transaction trong `finally`.
- **messages.sequence**: `UPDATE conversations SET next_message_sequence = next_message_sequence + 1 RETURNING next_message_sequence - 1` rồi INSERT.
- **State machine generation**: active = starting, running, finalizing_after_limit, continuing, stop_requested;
  terminal = stopped, completed, completed_partial, failed; continue từ continuable|stopped; mọi transition fence bằng `version`.
- **FK assistant_message_id** để NULL tới transaction lưu assistant message (R19).
- **Fernet**: `base64url(0x80 ‖ ts(8B BE) ‖ IV(16B) ‖ AES-128-CBC ‖ HMAC-SHA256(32B))`, key 32B = 16B sign + 16B enc.
- **bcrypt**: Python cost 12, prefix `$2b$` — dùng lib `bcrypt` (native), không `bcryptjs`.
- **SSE**: `X-Accel-Buffering: no`, `Cache-Control: no-cache`, `x-vercel-ai-ui-message-stream: v1`; heartbeat 1 s (sse) /
  `: keepalive` 15 s (ai-sdk); đúng một `[DONE]`; không gzip; frame ≤ 8 MiB; buffer tối đa 1 event.
- **hitl_interrupts.id** là VARCHAR(255) (id LangGraph), không validate UUID.
- **bigint** TypeORM trả string.
- **WS**: dùng `ws` adapter, không socket.io; frame snake_case theo `app/schemas/runtime_protocol.py`.
- **Redis BLPOP** chặn connection ⇒ connection riêng cho mỗi device loop.
