# Hợp đồng với AI Engine (/internal/v1)

> **Tách database (2026-11-20):** backend và Engine có DB riêng — thiết kế đầy đủ ở [integration.md](../integration.md).
> E5/E8/E9 và callback B1 đã thành **sự kiện** qua Redis Streams; Engine đọc dữ liệu backend qua **B-API** (B2–B4) hoặc
> nhận kèm trong E1/E3/E4. Bảng dưới đã sửa theo đó.

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
- E1/E3/E4 mang `modelRuntime` (model theo agent + key **đã giải mã**, C2) — Engine không còn đọc `model_providers`,
  `agent_model_configs`, `server_secrets`. E1 mang `history.throughSequence`; Engine kéo lịch sử qua **B2** (C1).
  `documents[]` của E1 là phạm vi RAG (C3/C4).

## Endpoint

| # | Method | Path | Kiểu | Backend gọi khi | Method trên `AiEngineClient` |
|---|---|---|---|---|---|
| E1 | POST | /internal/v1/turns | NDJSON | Lượt chat mới | `startTurn` |
| E2 | POST | /internal/v1/turns/{generationId}/stop | JSON | User Stop (lease reaper, xoá hội thoại ⇒ event `generation.lease_expired`, `conversation.deleted`; TC-71) | `stopTurn` |
| E3 | POST | /internal/v1/interrupts/{interruptId}/resume | NDJSON | HITL resume | `resumeInterrupt` |
| E4 | POST | /internal/v1/generations/{generationId}/continue | NDJSON | Continue sau hết budget | `continueGeneration` |
| ~~E5~~ | — | ~~/internal/v1/threads/delete~~ | — | **bỏ** ⇒ event `conversation.deleted`, `interrupt.expired` | — |
| E6 | POST | /internal/v1/titles | JSON | Sinh tiêu đề | `generateTitle` |
| E7 | POST | /internal/v1/task-plans/generate | JSON | Sinh task plan | `generateTaskPlan` |
| ~~E8~~ | — | ~~/internal/v1/documents/{documentId}/index~~ | — | **bỏ** ⇒ event `document.uploaded` | — |
| ~~E9~~ | — | ~~DELETE …/index~~ | — | **bỏ** ⇒ event `document.deleted` | — |
| E10 | GET | /internal/v1/tool-results/{blobId} | raw | GET /api/v1/tool-results/{id} | `getToolResult` |
| E11 | GET | /internal/v1/usage/dashboard | JSON | Dashboard usage (chỉ trả id hội thoại; backend ghép tiêu đề) | `getUsageDashboard` |
| E12 | GET | /internal/v1/usage/conversations/{id} | JSON | Usage theo hội thoại | `getConversationUsage` |
| E13–E20 | * | /internal/v1/mcp/... | JSON | /api/v1/mcp-*; E18 validate custom agent | `*Mcp*` |
| E21 | GET | /internal/v1/health | JSON | /api/v1/health/dependencies | `health` |
| ~~B1~~ | — | ~~/internal/v1/documents/{documentId}/status~~ | — | **bỏ** ⇒ event `document.processing_status_changed` (Engine → backend) | — |

### Engine gọi backend (B-API, chỉ đọc — [src/contracts/backend/internal-api.ts](../../src/contracts/backend/internal-api.ts), task INT-01)

| # | Method | Path | Dùng cho |
|---|---|---|---|
| B2 | GET | /internal/v1/conversations/{id}/messages?ownerId&afterSequence&throughSequence&limit | lịch sử prompt, tóm tắt, memory hội thoại fork (C1, C6, C18) |
| B3 | GET | /internal/v1/users/{userId}/message-search?q&projectId&conversationId&limit | tool tìm hội thoại |
| B4 | POST | /internal/v1/model-runtime/resolve | model + key cho worker ngoài lượt (C2) |

## Sự kiện thay cho outbox → HTTP

Bản spec cũ: bộ phát outbox gọi HTTP E2/E5/E8/E9. Bản mới: relay đẩy mỗi dòng outbox lên Redis Stream
`bus:backend:events`; Engine tiêu thụ bằng consumer group `engine`. Danh mục, payload, đảm bảo giao nhận:
[integration.md §6](../integration.md); kiểu: [src/contracts/events/](../../src/contracts/events/).

| event_type | Ghi khi | Engine làm |
|---|---|---|
| conversation.deleted | xoá mềm hội thoại | dừng run của hội thoại, xoá thread `threadIds` (= generations.checkpoint_thread_id ∪ hitl_interrupts.thread_id), bỏ summary/job/cache |
| conversation.forked | fork hội thoại | chuẩn bị memory cho hội thoại con (summary nguồn + B2) |
| conversation.turn_persisted | lưu xong tin nhắn của lượt (GEN-04) | upsert job tóm tắt (thay C6) |
| message.mutated | sửa/xoá message | invalidate summaries/jobs (C19) |
| project.deleted | xoá project | xoá mềm user_memories của project (C19) |
| document.uploaded | upload | parse + index (thay E8) |
| document.deleted | xoá tài liệu | xoá chunk/ảnh/artifact/vector (thay E9); backend tự xoá object S3 sau commit |
| interrupt.expired | sweep mỗi phút | xoá thread checkpoint (thay E5) |
| generation.lease_expired | lease reaper | dừng run nếu còn chạy (như E2) |

Chiều ngược: Engine phát `document.processing_status_changed` lên `bus:engine:events` (thay B1); backend rào bằng
`attemptId`, không lùi trạng thái. Retry: relay backoff 5 s × 2ⁿ, ≤ 12 lần rồi `failed`; bên nhận chống trùng bằng inbox.

## Quyết định phải nhớ (D*)

- **D1** seam = MessageService; vào `WorkflowExecutionRequest`, ra `V3StreamEvent`.
- **D2** Backend chiếu V3 sang cả SSE nội bộ và AI SDK v6; Engine chỉ nói V3.
- **D3** Backend giữ khoá lượt và row `generations`; Engine không bao giờ khoá. Khoá nằm trong DB backend, không còn dùng chung với Python.
- **D4/D5** Lease 30 s gia hạn mỗi 10 s; client ngắt **không** huỷ lượt (cần chốt lại với FE — code Python hiện vẫn huỷ).
- **D6** Persist trước, forward sau.
- **D7** Device dispatch qua Redis, key `client-runtime:*` không đổi; WS gateway về backend.
- **D8** Media + upload lên object storage trước khi tách.
- **D9/D10** Outbox cho side effect chéo miền. ~~Schema chỉ thêm khi còn chung DB~~ — từ 2026-11-20 hai DB tách hẳn; outbox ⇒ Redis Streams ([integration.md](../integration.md)).
- **D15** Không sở hữu = 404, không phải 403.
- **D19** Chấp nhận access token cũ (không `type`) tới hạn; refresh JWT cũ đổi được 1 lần trong 7 ngày.
- **D23** `stream` trong body + `protocol=sse|ai-sdk` trong query.
- **D24** Xoá hội thoại đang có lượt active ⇒ 409.

## Chi tiết dễ trượt khi port (§11)

- **Khoá lượt**: `pg_try_advisory_xact_lock(key)` sau `SET LOCAL idle_in_transaction_session_timeout = 0`;
  key = 8 byte đầu của `sha256(str(conversation_id))`, big-endian, ép int64 có dấu; poll 50 ms tới 30 s;
  một connection riêng giữ transaction suốt lượt; release = đóng transaction trong `finally`. Chỉ backend khoá, trên DB
  của mình (công thức giữ như Python cho dễ đối chiếu, không còn bắt buộc).
- **messages.sequence**: `UPDATE conversations SET next_message_sequence = next_message_sequence + 1 RETURNING next_message_sequence - 1` rồi INSERT.
- **State machine generation**: active = starting, running, finalizing_after_limit, continuing, stop_requested;
  terminal = stopped, completed, completed_partial, failed; continue từ continuable|stopped; mọi transition fence bằng `version`.
- **FK assistant_message_id** để NULL tới transaction lưu assistant message (R19).
- **Fernet**: `base64url(0x80 ‖ ts(8B BE) ‖ IV(16B) ‖ AES-128-CBC ‖ HMAC-SHA256(32B))`, key 32B = 16B sign + 16B enc.
  Chỉ backend giải mã (dữ liệu chép 1:1 từ DB cũ vẫn mã hoá bằng khoá cũ); Engine nhận key đã giải mã (Q11).
- **bcrypt**: Python cost 12, prefix `$2b$` — dùng lib `bcrypt` (native), không `bcryptjs`.
- **SSE**: `X-Accel-Buffering: no`, `Cache-Control: no-cache`, `x-vercel-ai-ui-message-stream: v1`; heartbeat 1 s (sse) /
  `: keepalive` 15 s (ai-sdk); đúng một `[DONE]`; không gzip; frame ≤ 8 MiB; buffer tối đa 1 event.
- **hitl_interrupts.id** là VARCHAR(255) (id LangGraph), không validate UUID.
- **bigint** TypeORM trả string.
- **WS**: dùng `ws` adapter, không socket.io; frame snake_case theo `app/schemas/runtime_protocol.py`.
- **Redis BLPOP** chặn connection ⇒ connection riêng cho mỗi device loop.
- **Cờ rich-response** (thêm 18/11, theo chatbot `de4a12b1`, `e48fa5cb`): E1, E3, E4 mang
  `inlineRichResponseV1`, `answerVisualsV1`, `sourceFiguresV1` **đã tính hiệu lực** (cờ client ∧
  `inlineRichResponseV1` ∧ công tắc `INLINE_RICH_RESPONSE_ENABLED`) — kiểu `RichCapabilitiesV1`. Bản DRAFT trước
  đó thiếu cả `inlineRichResponseV1` ở E3/E4. Python: `WorkflowExecutionRequest.answer_visuals_v1/source_figures_v1`.
- **WS thiết bị** (chatbot `7cb2a535`, 06/11): `heartbeat` khi phiên runtime trong Redis đã hết hạn ⇒ đóng mã
  1012 "Runtime session expired; register and reconnect." thay vì `ack`.
