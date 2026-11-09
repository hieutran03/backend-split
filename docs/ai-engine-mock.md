# Mock AI Engine

Mọi chỗ cần AI đều đi qua port `AiEngineClient` ([src/platform/ports/ai-engine.port.ts](../src/platform/ports/ai-engine.port.ts)).
Chọn adapter bằng env:

| `AI_ENGINE_MODE` | Adapter | Dùng khi |
|---|---|---|
| `mock` (mặc định) | `MockAiEngineClient` — trong tiến trình | dev, unit test, chưa có Engine Python |
| `http` | `HttpAiEngineClient` — gọi `AI_ENGINE_BASE_URL` | tích hợp với Engine thật |

Production từ chối `mock` ngay lúc khởi động.

## Mock làm được gì

Giữ **đúng hợp đồng** để test được mọi nhánh của orchestrator, nội dung trả lời là giả:

- E1/E3/E4: stream V3 với `seq` tăng dần, `run_start` → `agent_selected` → delta → **đúng 1 terminal**.
- E2 Stop: lượt đang chạy kết thúc bằng `complete{status:"stopped"}` + text dở; gọi lại ⇒ `not_inflight`.
- E5/E8/E9: ghi lại vào `mock.calls` (test outbox). E8 sau `AI_ENGINE_MOCK_INDEX_DELAY_MS` gọi **B1**
  về chính backend (`http://localhost:$PORT/internal/v1/documents/{id}/status`); tên file chứa
  `fail` ⇒ callback `failed`.
- E6 title, E7 task plan, E10–E12 usage/tool result, E13–E20 MCP (registry in-memory 2 server, 3 tool), E21 health.

## Kịch bản bằng marker trong tin nhắn

| Marker | Kết quả |
|---|---|
| (không có) | trả lời bình thường, terminal `complete` |
| `[mock:tool]` | thêm `tool_execution_start/end` |
| `[mock:subagent]` | thêm `subagent_start/end` |
| `[mock:reasoning]` | thêm `reasoning_delta` |
| `[mock:sources]` | thêm `sources` trước complete |
| `[mock:todo]` | complete có `todoUpdates` |
| `[mock:media]` | complete có `generatedMedia` |
| `[mock:interrupt]` | terminal `interrupt` (HITL, tool `run_shell` cần duyệt) |
| `[mock:continuation]` | terminal `continuation_available` |
| `[mock:error]` | terminal `error` |
| `[mock:disconnect]` | stream đứt, **không** có terminal |
| `[mock:slow]` | chậm ×10 (test Stop, lease) |
| `[mock:long]` | câu trả lời dài |

Kết hợp được: `"tra cứu [mock:tool] [mock:interrupt]"`.

## Xem nhanh

```bash
pnpm dev
curl -N -X POST localhost:3000/api/v1/dev/engine/turns \
  -H "authorization: Bearer $(pnpm -s token:dev)" -H 'content-type: application/json' \
  -d '{"message":"xin chào [mock:tool]"}'
```

## Trong unit test

```ts
const engine = new MockAiEngineClient({ delayMs: 0, indexDelayMs: 0, backendCallbackBaseUrl: '', serviceToken: 't' });
```

## Khi đổi hợp đồng

Sửa `src/contracts/engine/*` trước ⇒ compiler chỉ ra mock và http client phải sửa theo. Test
[mock-ai-engine.client.spec.ts](../src/platform/ai-engine/mock/mock-ai-engine.client.spec.ts) canh các bất biến
(seq, đúng 1 terminal, stop).
