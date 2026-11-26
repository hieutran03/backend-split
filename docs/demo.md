# Demo: chạy thử toàn bộ chức năng đã làm

`pnpm demo` gọi API thật (HTTP) qua mọi chức năng đã xong trong PLAN. Mỗi bước in ra request, response, câu
SQL kiểm tra DB và kết quả từng điều kiện (✓/✗), đồng thời ghi toàn bộ vào file log. Chạy hết khoảng 10 giây. Khi
có điều kiện sai thì exit code là 1, nên cũng dùng được như smoke test.

## Chuẩn bị

```bash
pnpm docker:up        # chỉ cần Postgres; Redis/MinIO chưa dùng
pnpm install
```

`.env` như khi `pnpm dev` (đọc `DATABASE_URL`, `JWT_SECRET`). **Không** cần migrate hay seed trước.

## Chạy

```bash
pnpm demo                        # tất cả 14 kịch bản
pnpm demo --list                 # danh sách kịch bản + task tương ứng
pnpm demo --only fork,feedback   # chạy vài kịch bản (user alice/bob tự tạo nếu thiếu)
pnpm demo --full                 # in nguyên token/chuỗi dài trên màn hình (file log luôn in nguyên)
pnpm demo --sql                  # in thêm mọi câu SQL TypeORM chạy
pnpm demo --verbose              # in thêm log khởi động của Nest (module, route)
pnpm demo --bail                 # dừng ở kịch bản đầu tiên có điều kiện sai
pnpm demo --no-color             # bỏ màu (khi chuyển output sang file)
```

## Script làm gì

1. **DB riêng cho demo:** xoá và tạo lại database `<tên DB trong DATABASE_URL>_demo` (mặc định `chatbot_demo`) trên
   cùng server, hoặc `DEMO_DATABASE_URL` nếu có (tên phải kết thúc bằng `_demo`). Chạy mọi migration. **DB dev không
   bị đụng tới.** DB demo giữ lại sau khi chạy để xem bằng `psql`.
2. **Bật app trong tiến trình**, cổng ngẫu nhiên, mock AI Engine. Ghi đè vài biến cho demo:
   - `AUTH_USER_STATE_CACHE_SECONDS=0`: guard đọc lại `token_version`/`deleted_at` mỗi request;
   - `JWT_LEGACY_REFRESH_UNTIL`: 7 ngày tới, để thử đổi refresh JWT cũ (D19);
   - `AI_ENGINE_MOCK_DELAY_MS=20`.
3. **Chạy các kịch bản** bằng `fetch` thật tới app.
   - Tin nhắn chưa có API ghi (lượt chat là W4), nên script chèn tin thẳng vào bảng `messages` (bước "seed").
   - Bước seed được in rõ trong log.
4. **In bảng tổng kết** (số bước, số điều kiện, số sai, thời gian) và đường dẫn file log `logs/demo-<thời gian>.log`.

## Đọc output

```text
  ▸ 10.3 Replay the same request (same requestId + body)        ← bước: số kịch bản.số bước
      Idempotent: 200 and the same child, nothing new is created. ← vì sao bước này có ý nghĩa
    → POST   /api/v1/conversations/…/forks                      ← request
      as alice (Bearer eyJhbGciOiJIUzI1…)                        ← ai gọi (token rút gọn)
      body: { … }
    ← 200 OK (2 ms)                                              ← response + thời gian
        { "success": true, … }
    ✓ HTTP 200                                                   ← điều kiện đúng
    ✓ same child = "…"
    ⛁ SQL conversation.forked …                                  ← kiểm DB: câu SQL + các dòng trả về
    ℹ …                                                          ← ghi chú
      [app] LOG [AiEngine] …                                     ← log của chính app
```

- Màu: xanh là 2xx, vàng là 4xx, đỏ là 5xx hoặc điều kiện sai.
- Trên màn hình, chuỗi dài hơn 120 ký tự (token, hash) bị rút gọn.
- File log không màu và in nguyên mọi chuỗi, kể cả log khởi động của Nest.

## Kịch bản

| Kịch bản | Task | Cho thấy |
|---|---|---|
| `health` | F-05, F-11, F-16 | `/health`, `/health/dependencies` (Postgres + E21 mock), Swagger `/docs-json`, envelope lỗi |
| `auth` | AUTH-01, AUTH-02, USR-01, SYNC-02 | bcrypt `$2b$12$`, chuẩn hoá email (TC-17, TC-73), 409/400/401, refresh xoay vòng + dùng lại ⇒ thu hồi cả chuỗi, logout một/tất cả thiết bị |
| `auth-guard` | AUTH-02 (D19), AUTH-03 | token cũ không `type`, sai loại, sai khoá, hết hạn; tăng `token_version`; đổi refresh JWT cũ một lần; user bị xoá |
| `projects` | F-10 | PJ1–PJ4, phân trang S2, 404 khi không sở hữu (D15) |
| `conversations` | CONV-01 | A7, A8, A11; `personaPrompt: null`; `title: null` ⇒ 400 |
| `conversation-list` | CONV-01, CONV-04, SYNC-02 | tìm theo độ liên quan như Python, tìm theo nội dung tin, `include=messages` |
| `messages` | MSG-01, MSG-02 | `sender` 1/2 ⇒ user/assistant, mặc định `-sequence`, UIMessage (parts, làm sạch metadata, giấu URL ảnh riêng) |
| `feedback` | FB-01 | 1 feedback/tin, 409, rating 1–5, `include=feedback` |
| `task-plans` | TP-01, TP-02 | `plan_lifecycle` draft → executing → completed → null |
| `fork` | CONV-03, SYNC-02 | copy tiền tố giữ `sequence`, replay 200, 409, 410, outbox `conversation.forked` |
| `project-membership` | PJ-06, PJ-05 | gắn/gỡ idempotent, xoá project gỡ hội thoại + outbox `project.deleted` |
| `delete-conversation` | CONV-02 | xoá mềm, 404 khắp nơi, con của fork còn, outbox `conversation.deleted` |
| `outbox` | F-06, DS-01 | mọi sự kiện đã ghi, đều `pending` (relay là BUS-01) |
| `engine-mock` | F-07, F-08, F-11 | stream V3 NDJSON theo thời gian thực: complete / interrupt / error / continuation |

## Thêm kịch bản khi làm task mới

1. Viết một `Scenario` trong `scripts/demo/scenarios/` (xem các file sẵn có).
   - Dùng `ctx.step()` cho mỗi bước, `ctx.api.*` để gọi API.
   - Kiểm bằng `ctx.expect()` / `ctx.expectInvalid()` / `ctx.equal()`.
   - `ctx.sql()` để xem DB.
2. Thêm vào `SCENARIOS` trong `scripts/demo/scenarios/index.ts`.
3. Chạy `pnpm demo --only <id>`.
   - Chuỗi trong script viết tiếng Anh (luật 9 của AGENTS.md).
   - Mọi câu giải thích phải khớp code: không ghi hành vi mình chưa kiểm.
