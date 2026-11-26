# 022 — Script demo chạy toàn bộ chức năng đã làm

> Task: DEMO-01 · Ngày: 2026-11-26 · Trạng thái: chờ review
>
> Hướng dẫn dùng: [docs/demo.md](../demo.md).

## Tóm tắt dễ hiểu

Hiếu muốn một bản chạy thử kiểu "demo": một lệnh chạy qua mọi chức năng đã làm và in đầy đủ thông tin trong lúc chạy.

`pnpm demo` làm việc đó. Nó tự dựng một database riêng, bật backend, rồi lần lượt gọi API như một client thật.
Mỗi bước in ra:
- gửi gì, nhận gì;
- trong DB có gì;
- điều kiện nào đúng, điều kiện nào sai.

Tất cả được lưu vào file log để đọc lại. Hiện có 14 kịch bản, 109 bước, 258 điều kiện; chạy khoảng 10 giây.

Ngay lần chạy đầu, demo đã bắt được một chỗ lệch Python mà unit test bỏ sót. Chỗ đó đã sửa (TC-73).

## Vấn đề cần giải quyết

- Unit test chạy use case với repository giả. Chúng không chứng minh được rằng controller, guard, pipe zod, envelope,
  SQL thật và migration ghép với nhau đúng.
- Integration test với Postgres thật (F-14) chưa có.
- Người review cần **thấy** hành vi, không chỉ đọc code: request, response, dòng trong DB, sự kiện outbox.
- Không được làm bẩn DB dev, và phải chạy lại được bao nhiêu lần cũng được.

## Đã giải quyết thế nào

- **DB riêng:** mỗi lần chạy xoá và tạo lại `<db>_demo` rồi chạy mọi migration. Script từ chối nếu tên DB không
  kết thúc bằng `_demo`.
- **App thật trong tiến trình:**
  - dùng chính `AppModule`, cùng prefix và Swagger như `main.ts`;
  - nghe cổng ngẫu nhiên (không đụng `pnpm dev` đang chạy);
  - dùng mock AI Engine.
- **Gọi bằng HTTP thật** (`fetch`), nên mọi lớp đều chạy: guard, pipe, filter, interceptor, TypeORM, transaction.
- **Log hai nơi:**
  - màn hình có màu, chuỗi dài rút gọn;
  - file `logs/demo-<thời gian>.log` không màu, không rút gọn;
  - file có thêm log khởi động của Nest và (với `--sql`) mọi câu SQL.
- **Điều kiện không dừng cuộc chạy:**
  - sai một điều kiện thì ghi lại rồi chạy tiếp; cuối bài in danh sách điều kiện sai;
  - exit code 1 khi có điều kiện sai, nên dùng được như smoke test.

## Chi tiết kỹ thuật

### Code then chốt

| File | Vai trò |
|---|---|
| `scripts/demo/run-demo.ts` | Đọc tuỳ chọn, dựng DB demo + migrate, bật app (`NestFactory.create(AppModule)`, `listen(0)`), chạy kịch bản, in tổng kết |
| `scripts/demo/kit.ts` | `DemoLog` (màn hình + file), `ApiClient` (log request/response, đọc NDJSON theo dòng), `Recorder` (✓/✗) |
| `scripts/demo/context.ts` | `DemoContext`: `step`, `expect`, `expectInvalid`, `equal`, `sql`, `note`; kiểu `Scenario` |
| `scripts/demo/scenarios/*.ts` | 14 kịch bản theo nhóm (identity, projects, conversations, messages, task-plans, platform) + `fixtures.ts` |
| `package.json` | `"demo": "ts-node --transpile-only -r tsconfig-paths/register scripts/demo/run-demo.ts"` |

Một số điểm:
- **Ghi đè env trước khi tạo app**, vì `loadConfig()` chạy trong factory của `CoreModule`:
  - `AUTH_USER_STATE_CACHE_SECONDS=0`: tăng `token_version` hay xoá user có hiệu lực ngay;
  - `JWT_LEGACY_REFRESH_UNTIL` = 7 ngày tới, để thử D19;
  - `AI_ENGINE_MODE=mock`.
- **`--transpile-only`:** khởi động nhanh. Kiểm kiểu vẫn do `pnpm typecheck`, vì `tsconfig.json` có
  `scripts/**/*.ts`.
- **Tin nhắn chèn bằng SQL:**
  - chưa có API ghi tin (lượt chat là W4), nên `seedChat` chèn 4 tin đúng dạng một lượt xong để lại: `sender` 1/2,
    `sequence` từ 1;
  - metadata lấy từ test vàng của MSG-02 (khoá phải bị lọc, URL ảnh riêng), để thấy projection làm sạch;
  - bước seed được in rõ trong log.
- **Lỗi validate kiểm theo đúng spec §4.1 S1:** 400 `bad_request` + `data.errors[{field,message}]`, **không** có
  `reason`.
  - `ValidationError` có gắn `reason: 'validation_failed'` nhưng filter cố ý không trả ra.
  - Lần chạy đầu kỳ vọng sai chỗ này; đã sửa script, không sửa code.

### Request / Response mẫu (lấy từ lần chạy thật)

```text
  ▸ 10.3 Replay the same request (same requestId + body)
      Idempotent: 200 and the same child, nothing new is created.
    → POST   /api/v1/conversations/b69c6222-…/forks
      as alice (Bearer eyJhbGciOiJIUzI1…)
      body: { "messageId": "a49e4cff-…", "requestId": "289cbfb3-…" }
    ← 200 OK (2 ms)
    ✓ HTTP 200
    ✓ same child = "…"

  ▸ 14.2 Turn: "Weather in Hue [mock:tool] [mock:reasoning] [mock:sources]"
    ← 200 OK content-type: application/x-ndjson — streaming…
      +    3 ms  seq=1 run_start {"executionEpoch":1,"checkpointThreadId":"routing-v2:…"}
      +   28 ms  seq=2 agent_selected {"agentId":"search_agent"}
      +   59 ms  seq=3 reasoning_delta {"messageId":"…","delta":"Thinking "}
      +   91 ms  seq=5 tool_execution_start {"toolCallId":"call_6d9eff3a","toolName":"search","toolOrigin":"mcp",…}
      +  153 ms  seq=6 tool_execution_end {…,"status":"ok","output":{"hits":3}}
      +  183 ms  seq=7 message_delta {"messageId":"…","delta":"This "}
```

Tổng kết lần chạy 2026-11-26 (Node 22.23, Postgres 16 của docker-compose):

```text
 scenario               steps  checks  failed     time
 health                     4       9       0     0.0s
 auth                      14      34       0     1.7s
 auth-guard                 7      15       0     0.7s
 projects                   8      14       0     0.1s
 conversations              6      12       0     0.0s
 conversation-list          8      20       0     0.1s
 messages                   8      25       0     0.1s
 feedback                   9      15       0     0.1s
 task-plans                12      35       0     0.2s
 fork                      10      21       0     0.1s
 project-membership         9      23       0     0.1s
 delete-conversation        7      13       0     0.1s
 outbox                     2       2       0     0.0s
 engine-mock                5      20       0     2.6s
 TOTAL                    109     258       0     5.9s
```

## Cách thử

| TC | Lệnh | Kỳ vọng |
|---|---|---|
| 1 | `pnpm demo` | 258/258 ✓, exit 0, có file `logs/demo-*.log` |
| 2 | `pnpm demo --only fork,outbox` | tự tạo alice/bob trước, 27 ✓ |
| 3 | `pnpm demo --list` | 14 kịch bản, không đụng DB |
| 4 | `pnpm demo --only nope` | báo kịch bản lạ, exit 2 |
| 5 | Tạm sửa một kỳ vọng sai trong kịch bản | ✗ đỏ, danh sách điều kiện sai ở cuối, exit 1 |
| 6 | `psql …/chatbot_demo` sau khi chạy | còn dữ liệu của lần chạy để xem |

## Giới hạn & việc còn lại

- Không thay integration test (F-14). Demo phục vụ xem và smoke test, kỳ vọng viết bằng tay.
- Tin nhắn được chèn bằng SQL. Khi có lượt chat (W4), kịch bản `messages`/`fork` nên tạo tin qua A13/E1 với mock
  Engine.
- `threadIds` của `conversation.deleted` luôn rỗng: nguồn thread còn là stub `NoThreadSource` tới W4.
- Outbox chỉ `pending`. Relay Redis Streams là BUS-01; khi có relay, thêm kịch bản đọc `bus:backend:events`.
- Lỗi do người dùng (kịch bản lạ) vẫn in stack trace. Chưa gọn, nhưng không ảnh hưởng.

## Điểm tranh cãi & quyết định

### TC-73 — Email đăng ký có khoảng trắng đầu/cuối
Demo lộ ra lệch này. Chi tiết và quyết định ở [005](005-dang-ky-dang-nhap.md#tc-73--email-đăng-ký-có-khoảng-trắng-đầucuối).

### TC-74 — `sort` theo trường không được phép
- **Bối cảnh:**
  - `parseSort` (`src/shared/pagination/page.ts`) gặp trường ngoài whitelist thì **lặng lẽ** dùng thứ tự mặc định.
  - Ví dụ `GET …/messages?sort=content` trả 200, sắp `-sequence`.
  - Spec S2 chỉ nói mỗi module có whitelist, không nói gặp trường lạ thì làm gì.
  - Chưa đối chiếu Python. Python dùng `orderBy`/`orderDirection`, khác tên tham số, nên không so 1:1 được.
- **Phương án:**
  - A) giữ như hiện tại: dễ chịu với client cũ, nhưng client gõ sai không biết mình sai;
  - B) 400 `bad_request` với `errors[{field:'sort'}]`: rõ ràng, nhưng client gửi trường lạ sẽ vỡ.
- **Đang chọn:** A — giữ nguyên code. Demo ghi lại hành vi này: bước 7.3 kiểm 200 + thứ tự mặc định.
- **Trạng thái:** ~~mở — Hiếu xem.~~ **Chốt 26/11 (Hiếu):** A — dùng thứ tự mặc định; trả 400 thì client rất khó dùng.
  Thêm cùng lúc: comment của `parseSort`, mô tả `sort` trong Swagger (thứ tự mặc định và trường cho phép của từng
  danh sách, hiện ở mô tả tham số), test `src/shared/pagination/page.spec.ts` và
  `src/platform/http/pagination.query.spec.ts`; quy tắc phân trang S2 trong artifact ghi rõ hành vi này.
- **Nếu đổi sang B:** `parseSort` ném `ValidationError`, hoặc đưa whitelist vào schema zod của từng route; sửa demo bước 7.3.

## Lịch sử phiên bản
| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-26 | `pnpm demo`: 14 kịch bản, log màn hình + file, DB `_demo`; sửa signup email (TC-73); ghi TC-74 | Hiếu yêu cầu demo bằng script, có log theo dõi |
| v1.1 | 2026-11-26 | TC-74 chốt A (thứ tự mặc định); TC-73 chốt | Hiếu chọn: `sort` lạ dùng mặc định, không 400 |

## Gợi ý review
- Chạy `pnpm demo` một lần, đọc lướt file log: mỗi bước có đủ request, response và lý do không.
- Các câu giải thích trong kịch bản phải khớp code và spec. Chỗ nào nghi ngờ thì đối chiếu với nhật ký tương ứng (cột
  "Task" trong [demo.md](../demo.md#kịch-bản)).
- ~~TC-74: chọn A hay B.~~ Đã chốt A.
