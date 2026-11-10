# 002 — AI Engine giả lập (mock)

> Task: F-07, F-08, F-09, F-11 · Ngày: 2026-11-09 · Trạng thái: đã review (2026-11-10)

## Tóm tắt dễ hiểu

Phần "trí tuệ" của chatbot (LLM, tìm tài liệu, gọi tool…) vẫn nằm ở hệ thống Python gọi là
**AI Engine**. Backend mới chỉ nói chuyện với nó qua một "cổng" duy nhất.

Vì chưa có AI Engine chạy riêng, tôi làm một **AI giả lập**: nó trả lời giống hệt về *hình thức*
(chữ chạy ra từng phần, có lúc gọi tool, có lúc xin phép người dùng, có lúc báo lỗi…) nhưng *nội dung*
là câu trả lời mẫu. Nhờ vậy backend được xây và kiểm thử đầy đủ mà không tốn tiền gọi AI thật,
không phải chờ đội Python.

Muốn thử tình huống nào thì gõ "mã" vào tin nhắn, ví dụ `[mock:interrupt]` để giả lập AI dừng lại
xin phép chạy lệnh, `[mock:error]` để giả lập lỗi.

Khi AI Engine thật sẵn sàng, chỉ đổi một dòng cấu hình `AI_ENGINE_MODE=http` — không sửa code.

## Vấn đề cần giải quyết

- Spec §8: backend gọi Engine qua `/internal/v1` (E1–E21) + Engine gọi ngược 1 callback (B1).
  Lượt chat là stream NDJSON sự kiện V3, **đúng một** sự kiện kết thúc.
- Phần khó nhất của backend (W4: khoá lượt, lease, Stop, HITL, Continue, mất kết nối) chỉ test được
  nếu có thứ phát ra *đủ mọi nhánh* sự kiện một cách chủ động.
- Chưa có code Python để đối chiếu ⇒ hợp đồng phải để ở một chỗ, dễ sửa khi có thông tin thật.

## Đã giải quyết thế nào

- Định nghĩa **hợp đồng** (kiểu dữ liệu request/sự kiện) trong `src/contracts/engine/` — đánh dấu DRAFT.
- Một **interface** `AiEngineClient` với 1 method cho mỗi endpoint E1–E21.
- Hai bản cài đặt dùng chung interface:
  - `MockAiEngineClient` — giả lập trong tiến trình;
  - `HttpAiEngineClient` — gọi Engine thật, đọc NDJSON từng dòng không chờ hết body.
- Một API chỉ dành cho dev (`POST /api/v1/dev/engine/turns`) để xem tận mắt luồng sự kiện.

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Kiểu sự kiện V3 | [src/contracts/engine/v3-events.ts](../../src/contracts/engine/v3-events.ts) |
| Body E1–E21, B1 | [src/contracts/engine/internal-api.ts](../../src/contracts/engine/internal-api.ts) |
| Interface (port) | [src/platform/ports/ai-engine.port.ts](../../src/platform/ports/ai-engine.port.ts) |
| Mock | [src/platform/ai-engine/mock/mock-ai-engine.client.ts](../../src/platform/ai-engine/mock/mock-ai-engine.client.ts) |
| Marker kịch bản | [src/platform/ai-engine/mock/mock-scenario.ts](../../src/platform/ai-engine/mock/mock-scenario.ts) |
| Client thật | [src/platform/ai-engine/http/http-ai-engine.client.ts](../../src/platform/ai-engine/http/http-ai-engine.client.ts) |
| Chọn adapter theo env | [src/platform/core.module.ts](../../src/platform/core.module.ts) |
| Playground | [src/modules/dev-tools/engine-playground.controller.ts](../../src/modules/dev-tools/engine-playground.controller.ts) |

### Code then chốt

Chọn bản cài đặt theo cấu hình (production cấm `mock` ngay lúc khởi động):

```ts
if (c.mode === 'http') return new HttpAiEngineClient({ baseUrl, serviceToken, timeoutMs });
return new MockAiEngineClient({ delayMs, indexDelayMs, backendCallbackBaseUrl, serviceToken, log });
```

Mỗi sự kiện có `seq` tăng dần; Stop làm lượt kết thúc bằng `complete{status:"stopped"}`:

```ts
for (let i = 0; i < cutAt; i++) {
  if (turn.stopRequested) break;
  yield emit({ type: 'message_delta', data: { messageId, delta } });
}
if (turn.stopRequested) {
  yield emit({ type: 'complete', data: this.completePayload(text, scenario, 'stopped') });
  return;
}
```

### Bảng marker

| Marker | Kết quả |
|---|---|
| (không có) | trả lời bình thường → `complete` |
| `[mock:tool]` | thêm `tool_execution_start/end` |
| `[mock:interrupt]` | dừng xin duyệt tool → `interrupt` |
| `[mock:continuation]` | hết ngân sách → `continuation_available` |
| `[mock:error]` | → `error` |
| `[mock:disconnect]` | stream đứt, **không** có sự kiện kết thúc |
| `[mock:slow]` / `[mock:long]` | chậm ×10 / trả lời dài (test Stop) |
| `[mock:sources]` `[mock:todo]` `[mock:media]` `[mock:reasoning]` `[mock:subagent]` | thêm phần tương ứng |

### Request / Response mẫu (chạy thật 2026-11-09)

```http
POST /api/v1/dev/engine/turns
Authorization: Bearer <token>
Content-Type: application/json

{"message":"thời tiết hôm nay [mock:tool] [mock:interrupt]"}
```

Trả về `application/x-ndjson`, mỗi dòng một sự kiện (rút gọn):

```json
{"v":3,"seq":1,"type":"run_start","data":{"executionEpoch":1,"checkpointThreadId":"routing-v2:…"}}
{"v":3,"seq":2,"type":"agent_selected","data":{"agentId":"search_agent"}}
{"v":3,"seq":3,"type":"tool_execution_start","data":{"toolCallId":"call_6454…","toolName":"search","toolOrigin":"mcp",…}}
{"v":3,"seq":4,"type":"tool_execution_end","data":{"toolCallId":"call_6454…","status":"ok",…}}
{"v":3,"seq":5,"type":"message_delta","data":{"messageId":"b8f5…","delta":"Đây "}}
…
{"v":3,"seq":16,"type":"heartbeat","data":{}}
…
{"v":3,"seq":18,"type":"interrupt","data":{"schema":"interrupt.v1","interruptId":"mock-interrupt-…",
  "actionRequests":[{"toolName":"run_shell","toolOrigin":"client","args":{"command":"ls -la"}}],"expiresInSeconds":900,…}}
```

`GET /api/v1/health/dependencies` cho biết đang dùng mock:

```json
{"success":true,"code":"ok","message":"OK","data":{"status":"ok","checks":{
  "postgres":{"status":"ok"},"aiEngine":{"status":"ok"},"aiEngine.mode":{"status":"ok","detail":"mock"},…}}}
```

### Test canh hợp đồng

[mock-ai-engine.client.spec.ts](../../src/platform/ai-engine/mock/mock-ai-engine.client.spec.ts) kiểm:
`seq` liên tục từ 1; đúng 1 terminal; mỗi marker ra đúng terminal; `disconnect` không có terminal;
Stop giữa chừng ⇒ `stopped`, gọi lại ⇒ `not_inflight`. [ndjson.spec.ts](../../src/platform/ai-engine/http/ndjson.spec.ts)
kiểm việc ghép dòng bị cắt giữa các chunk.

## Cách thử

Swagger `/docs` → nhóm **dev** → `POST /dev/engine/turns`, hoặc:

```bash
curl -N -X POST localhost:3000/api/v1/dev/engine/turns \
  -H "authorization: Bearer $(pnpm -s token:dev)" -H 'content-type: application/json' \
  --data-binary '{"message":"hello [mock:tool]"}'
```

## Giới hạn & việc còn lại

- **Hợp đồng là DRAFT** suy ra từ spec — phải đối chiếu `events.py`, `workflow.py` của Python (ENG-01, đang chặn vì chưa có code).
- `HttpAiEngineClient` chưa có retry, circuit breaker, timeout "im lặng" 5 s × 3 (ENG-03).
- Chưa có mock dạng HTTP server riêng để test client thật (ENG-02).
- Playground không lưu gì và bị gỡ ở production.

## Điểm tranh cãi & quyết định

### TC-6 — Mock chạy trong tiến trình hay là một server HTTP riêng?
- **Bối cảnh:** Cần AI giả để dev/test khi chưa có Engine.
- **Phương án:**
  - A) **Trong tiến trình** — không cần chạy thêm gì, test nhanh, điều khiển Stop trực tiếp;
    nhưng không kiểm được tầng HTTP/NDJSON thật.
  - B) Server HTTP riêng — giống thật hơn, nhưng thêm một thứ phải chạy, test chậm hơn.
- **Đang chọn:** A trước; B để sau (task ENG-02) khi cần test `HttpAiEngineClient`.
- **Trạng thái:** tạm chọn.

### TC-7 — Hợp đồng V3 tự suy ra từ spec, chấp nhận rủi ro sai?
- **Bối cảnh:** Chưa có quyền đọc `events.py` / `workflow.py` của Python. Spec chỉ mô tả tên sự kiện,
  không đủ chi tiết từng trường.
- **Phương án:** A) chờ có code Python mới làm · B) **làm bản DRAFT** gom vào một chỗ (`src/contracts/engine/`),
  sửa sau.
- **Đang chọn:** B — không chặn tiến độ; khi sửa hợp đồng, compiler chỉ ra mọi chỗ phải sửa theo.
- **Trạng thái:** **mở** — cần Hiếu cung cấp code Python (ENG-01).
- **Nếu sai nhiều:** sửa `v3-events.ts`, `internal-api.ts`, mock, http client và test hợp đồng; module
  nghiệp vụ gần như không ảnh hưởng vì chỉ dùng interface.

### TC-8 — Chọn kịch bản mock bằng marker trong tin nhắn hay bằng header/cấu hình?
- **Phương án:** A) **marker `[mock:*]` trong nội dung** — FE/QA thử được ngay trên UI chat, không cần công cụ;
  B) header `X-Mock-Scenario` — sạch hơn nhưng UI không gửi được.
- **Đang chọn:** A.
- **Trạng thái:** tạm chọn.

### TC-9 — Client ngắt kết nối có huỷ lượt chat không (D5)?
- **Bối cảnh:** Spec: **không** huỷ — backend đọc stream tới hết và lưu, client đồng bộ lại sau.
  Code Python hiện tại **vẫn huỷ** khi client ngắt (spec §7 ghi chú 14/10).
- **Ảnh hưởng tới mock:** port `AiEngineClient` đã ghi rõ "client ngắt không huỷ stream, chỉ Stop (E2) mới huỷ".
- **Trạng thái:** **mở** — cần chốt với FE trước khi làm W4 (GEN-04).

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | Hợp đồng DRAFT, mock in-process 12 marker, http client cơ bản, playground | — |

## Gợi ý review

- TC-7, TC-9 cần quyết định của bạn.
- Danh sách sự kiện V3 và các trường trong payload kết thúc có khớp hiểu biết của bạn về Engine không?
- Bộ marker đã đủ tình huống FE cần demo chưa?
