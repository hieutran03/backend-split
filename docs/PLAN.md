# PLAN — Chatbot Backend (NestJS)

> **Đây là anchor của dự án**: đang ở đâu, làm gì tiếp, ai làm. Mỗi khi xong / bắt đầu
> một task thì **sửa file này trong cùng commit**.
>
> Nguồn yêu cầu: artifact "Chatbot Backend Split" (tách phần quản lý/lưu trữ của chatbot
> FastAPI sang NestJS). Bản trích để tra cứu nằm ở [docs/reference/](reference/).

**Cập nhật lần cuối:** 2026-11-09 · **Giai đoạn hiện tại:** Phase 1 (W1) — lượt tiếp theo: AUTH-02

## Cách đọc

| Ký hiệu | Nghĩa |
|---|---|
| `[ ]` | Chưa làm |
| `[~]` | Claude đang làm (ghi ngày bắt đầu) |
| `[r]` | Code xong, `pnpm verify` xanh — **chờ Hiếu review** tính năng & kiến trúc |
| `[x]` | Hiếu đã review OK (hoặc đã sửa theo review) |
| `[!]` | Bị chặn — ghi lý do |

**Lượt (iteration):** mỗi vòng *nhận 1 task → code → test → chạy thật → nhật ký → `[r]` → commit*
là một **lượt**; kết quả là một **increment** chạy được và review được (một lát cắt dọc qua 4 tầng).

**Quy trình:** Claude lấy task theo thứ tự trong PLAN (WIP = 1) → code + test → `[r]` + commit
→ Hiếu review (comment trực tiếp hoặc ghi vào mục "Ghi chú review" bên dưới) → Claude sửa → `[x]`.
Hiếu muốn đổi thứ tự ưu tiên thì sửa thứ tự hoặc ghi vào mục "Câu hỏi / quyết định".

**Định nghĩa xong (DoD) cho một task module** (§11 tài liệu split):
1. Endpoint `/api/v1/...` đúng bảng [route-mapping.md](reference/route-mapping.md), envelope chuẩn.
2. Unit test use case (fake repo) — gồm test **user khác ⇒ 404**; route admin ⇒ 403 với user thường.
3. Domain/application không import framework (`pnpm test:architecture` xanh).
4. Migration dev cho bảng mới (nếu có), tên cột khớp [database-schema.md](reference/database-schema.md).
5. Side effect chéo miền đi qua **outbox trong cùng transaction**, không gọi Engine trực tiếp.
6. `pnpm verify` xanh. Chưa chạy thì ghi là chưa chạy, không tick khống.
7. **Nhật ký** `docs/journal/NNN-*.md`: phần dễ hiểu + kỹ thuật (code, request/response thật) +
   điểm tranh cãi `TC-n` + lịch sử phiên bản. Xem [journal/README.md](journal/README.md).

## Phân vai (chốt 2026-11-09)

- **Claude — làm chính toàn bộ:** mọi task trong PLAN (platform, module CRUD, phần khó),
  test, tài liệu, giữ PLAN luôn đúng trạng thái.
- **Hiếu — review:** duyệt tính năng (đúng spec, đúng hành vi FE cần) và kiến trúc; trả lời
  mục "Câu hỏi / quyết định đang mở"; cung cấp tài liệu/code Python khi task bị chặn.

## Gợi ý review cho mỗi task `[r]`

1. Route/response có khớp [route-mapping.md](reference/route-mapping.md) không? Thử trên Swagger `/docs`.
2. Logic nghiệp vụ nằm ở `domain/`/`application/`, controller mỏng?
3. Có test user khác ⇒ 404 không? Side effect chéo miền đi qua outbox?
4. Tên cột/bảng khớp [database-schema.md](reference/database-schema.md)?

---

## Phase 0 — Nền tảng & template (chờ review)

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| F-01 | Khởi tạo NestJS 11 + pnpm + TS strict, alias `@shared @contracts @platform @modules` | 🤖 | [r] |
| F-02 | Kiến trúc sạch "vừa phải" + luật dependency-cruiser + ESLint chặn framework trong core | 🤖 | [r] |
| F-03 | Config zod (đọc env một chỗ), CoreModule (clock, id, JWT, AI engine) | 🤖 | [r] |
| F-04 | Database: TypeORM DataSource, `DbContext` (transaction qua AsyncLocalStorage), `backend_migrations` | 🤖 | [r] |
| F-05 | HTTP: envelope `{success, code, message, data}`, exception filter, ZodValidationPipe, JWT guard toàn cục, `@Public` `@AdminOnly` `@CurrentActor` `@RawResponse` | 🤖 | [r] |
| F-06 | Outbox port + `TypeOrmOutbox` (enqueue trong transaction) + bảng `outbox_events` | 🤖 | [r] |
| F-07 | Hợp đồng Engine (DRAFT): `TurnRequestV1`, `V3StreamEvent`, payload terminal, port `AiEngineClient` E1–E21 | 🤖 | [r] |
| F-08 | **Mock AI Engine** in-process, kịch bản bằng marker `[mock:*]` (xem [ai-engine-mock.md](ai-engine-mock.md)) | 🤖 | [r] |
| F-09 | `HttpAiEngineClient` (NDJSON reader, service token, X-Request-Id) — bản cơ bản | 🤖 | [r] |
| F-10 | Module mẫu **projects** PJ1–PJ5 đủ 4 tầng + unit test → **template để copy** | 🤖 | [r] |
| F-11 | Health `/health`, `/health/dependencies`; dev playground `POST /dev/engine/turns` | 🤖 | [r] |
| F-12 | docker-compose (Postgres 16, Redis 7, MinIO), migration dev baseline, seed 2 user, `token:dev` | 🤖 | [r] |
| F-13 | Tài liệu tra cứu sinh từ spec: route mapping, DB schema, engine contract | 🤖 | [r] |
| F-16 | **Swagger** `/docs` + `/docs-json`: schema sinh từ chính zod (`@ApiZodBody`, `@ApiZodQuery`, `@ApiEnvelope`, `@ApiErrors`), bearer auth; tắt ở production trừ khi `SWAGGER_ENABLED=true` | 🤖 | [r] |
| F-14 | Integration test với Postgres thật (testcontainers hoặc docker compose) + CI (GitHub Actions/GitLab) | 🤖 | [ ] |
| F-15 | Request id middleware + log JSON (pino) + truyền `X-Request-Id` sang Engine | 🤖 | [ ] |

## Phase 1 — W1: Identity & đọc (31 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| AUTH-01 | Signup/login: bcrypt cost 12 tương thích `$2b$`, trùng email/username ⇒ 409; phát hành refresh token opaque — [nhật ký 005](journal/005-dang-ky-dang-nhap.md) | A1, A2 | 🤖 | [r] |
| AUTH-02 | Refresh token **opaque** xoay vòng (bảng `refresh_tokens`, SHA-256, `replaced_by_id`, thu hồi cả chuỗi khi dùng lại); logout thu hồi; refresh JWT cũ đổi 1 lần trong 7 ngày (D19) | A3, A4 | 🤖 | [ ] |
| AUTH-03 | Guard kiểm claim `ver` với `users.token_version` + `deleted_at` (cache ≤ 30 s); admin từ `ADMIN_USER_IDS` → sau này `users.role` | — | 🤖 | [ ] |
| USR-01 | `GET /users/me` | A5 | 🤖 | [ ] |
| CONV-01 | Conversations CRUD + list phân trang + soft delete; migration dev | A7–A11, A21–A24 | 🤖 | [ ] |
| CONV-02 | Xoá hội thoại: 409 nếu có lượt active (D24) + outbox `conversation.deleted` (đủ threadIds) | A12, A25 | 🤖 | [ ] |
| CONV-03 | Fork: REPEATABLE READ dưới khoá lượt nguồn, fingerprint sha256, unique `(owner_id, fork_request_id)`, replay 200/409/410, outbox `conversation.forked` | A12a | 🤖 | [ ] |
| MSG-01 | Messages đọc: `GET /messages/{id}`, list theo hội thoại (cursor theo `sequence` bigint), `sender` số ⇒ chuỗi | A10, A19, A20 | 🤖 | [ ] |
| MSG-02 | Projection UIMessage cho AI SDK (`?format=ui-message`) — port `ai_sdk_projection.py` | A26 | 🤖 | [!] cần code Python |
| FB-01 | Feedback: 1 feedback/message, rating 1–5, 409 `feedback_exists`, ownership qua message | A30, A32–A34 | 🤖 | [ ] |
| TP-01 | Task plans CRUD + complete + planning-status; mọi thay đổi tính lại `conversations.plan_lifecycle`; reorder dùng unique DEFERRABLE | A36–A42 | 🤖 | [ ] |
| PJ-05 | Hoàn thiện xoá project: thứ tự khoá project → hội thoại; xử lý conversations đang gắn | PJ5 | 🤖 | [ ] |
| PJ-06 | Gắn/gỡ hội thoại vào project | PJ6, PJ7 | 🤖 | [ ] |

## Phase 2 — W2: Cấu hình (36 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| CRY-01 | Fernet/MultiFernet trong Node + test giải mã **một row thật** của `model_providers` | — | 🤖 | [ ] |
| PRV-01 | Providers CRUD, validate key, list models (gọi vendor, cache 6 h), `keyPreview` | P1–P6 | 🤖 | [ ] |
| AMC-01 | Agent model configs + options + reset (bảng default copy từ `AGENT_CONFIG` Python) | M1–M4 | 🤖 | [ ] |
| CA-01 | Custom agents CRUD (partial unique `owner_id, slug`), options | A53–A58 | 🤖 | [ ] |
| CA-02 | Validate tool ref qua E18 + catalog device Redis; guard "agent đang dùng" bằng query `generations` active + `hitl_interrupts` pending | A54, A57 | 🤖 | [ ] |
| CA-03 | Gắn custom agents vào hội thoại | A59, A60 | 🤖 | [ ] |
| PJ-08 | Custom agents của project (allowlist = tập mặc định) | PJ8, PJ9 | 🤖 | [ ] |
| MCP-01 | MCP proxy: forward E13–E20, `@AdminOnly` cho thêm/xoá/toggle/execute, che env/headers | X1–X10 | 🤖 | [ ] |

## Phase 3 — W3: Tài liệu & media (10 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| STO-01 | Port `ObjectStorage` + adapter S3/MinIO (put stream, get, delete, presign) | — | 🤖 | [ ] |
| DOC-01 | Upload multipart (≤ 50 MB, đuôi hợp lệ, trùng tên theo `filename_key`) → S3 → row `documents` + outbox `document.uploaded` | D1, D2 | 🤖 | [ ] |
| DOC-02 | Callback **B1** `/internal/v1/documents/{id}/status`: ServiceTokenGuard, fence `attemptId`, idempotent, sai thứ tự | B1 | 🤖 | [ ] |
| DOC-03 | Get/list/patch/delete document (ownership qua conversation), processing-status; xoá qua outbox `document.deleted` | D3–D7 | 🤖 | [ ] |
| MED-01 | Chat image từ S3; web image proxy chống SSRF; tool result forward E10 | A47–A49 | 🤖 | [ ] |

## Phase 4 — W4: Lượt chat & HITL (13 route) — phần khó nhất

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| GEN-01 | `TurnLock`: advisory xact lock đúng công thức key Python, connection riêng, poll 50 ms ≤ 30 s ⇒ 409 `conversation_turn_conflict` | — | 🤖 | [ ] |
| GEN-02 | Domain `Generation` state machine + version fence + bảng `generations`, `generation_commands` | — | 🤖 | [ ] |
| GEN-03 | Gom body E1 (persona, documents, project instructions, custom agents, hitl policy, model config) qua port của từng module | — | 🤖 | [ ] |
| GEN-04 | `TurnOrchestrator`: lock → user message + generation (lease 30 s) → E1 → gia hạn lease 10 s → persist terminal (assistant msg, chat_images, web_image_refs, task_plans) → unlock. Client ngắt không huỷ lượt | A13, A14 | 🤖 | [ ] |
| GEN-05 | Projector **SSE nội bộ** (heartbeat 1 s) — byte-compatible với Python | A14 | 🤖 | [ ] |
| GEN-06 | Projector **AI SDK v6** (UI Message Stream v1, `: keepalive` 15 s, `[DONE]`, `finishReason:"error"`) | A27 | 🤖 | [ ] |
| GEN-07 | Stop: CAS version ⇒ `stop_requested`, `generation_commands`, E2; replay idempotent | A15 | 🤖 | [ ] |
| GEN-08 | Get generation + Continue (E4) | A16, A17, A29 | 🤖 | [ ] |
| HITL-01 | Resume: khoá → generation `running` → claim `pending→resolving` → audit `tool_approvals` → E3 | A18, A28 | 🤖 | [ ] |
| HITL-02 | Get interrupt | A46 | 🤖 | [ ] |
| TTL-01 | Generate title (E6), task plan generate (E7) | A6, A35 | 🤖 | [ ] |
| GLD-01 | Golden test stream (sync / SSE / AI SDK / Stop / Continue / HITL) — so từng byte trừ id/timestamp | — | 🤖 | [!] cần transcript Python |

## Phase 5 — W5: Thiết bị & widget (14 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| RDS-01 | Redis module + key schema `client-runtime:*`, `widget:*`, `interrupt:*` (không đổi tên key) | — | 🤖 | [ ] |
| DEV-01 | Client devices register/heartbeat/list/tool-catalog/skill-catalog/connected | C1–C6, R2 | 🤖 | [ ] |
| DEV-02 | WS gateway `/ws/device-runtime/{deviceId}` (ws adapter, BLPOP connection riêng) | R1 | 🤖 | [ ] |
| HS-01 | Tool approval settings theo device | A43–A45 | 🤖 | [ ] |
| WGT-01 | Widgets connection/action + WS `/ws/widgets` (JWT widget secret riêng, đóng 1008 khi sai token) | W1r–W3r | 🤖 | [ ] |

## Phase 6 — W6: Vận hành (16 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| OBX-02 | Outbox publisher (poll 2 s, `FOR UPDATE SKIP LOCKED`, backoff 5 s × 2ⁿ ≤ 12 lần) → E2/E5/E8/E9 | — | 🤖 | [ ] |
| OBX-03 | Admin outbox: list + retry | mới | 🤖 | [ ] |
| SCH-01 | Scheduler: lease reaper, interrupt expiry (mỗi phút), sweep document kẹt > 1 h | — | 🤖 | [ ] |
| USG-01 | Usage capabilities/dashboard/conversation (E11, E12) | A50–A52 | 🤖 | [ ] |
| OPS-01 | Health dependencies đủ (Redis, S3, Engine deep), `/metrics` Prometheus (gồm streaming H15) | H9–H13, H15 | 🤖 | [ ] |

## Song song suốt dự án

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| ENG-01 | Đối chiếu & freeze hợp đồng V3/E1 với code Python (`events.py`, `workflow.py`, `ai_sdk_v6.py`, `internal_sse.py`) | 🤖 | [!] cần quyền đọc repo chatbot |
| ENG-02 | Mock Engine **dạng HTTP server** riêng (`pnpm mock:engine`) để test `HttpAiEngineClient` + timeout im lặng | 🤖 | [ ] |
| ENG-03 | Cứng hoá `HttpAiEngineClient`: retry call idempotent, circuit breaker, timeout im lặng 5 s × 3 | 🤖 | [ ] |
| LEG-01 | Lớp tương thích route cũ (envelope cũ, snake_case, sender số, header Deprecation/Sunset, counter) | 🤖 | [ ] |
| SEC-01 | Đối chiếu §9.3 lỗi bảo mật: không bypass qua đường cũ | 🤖 | [ ] |

---

## Câu hỏi / quyết định đang mở

Chi tiết bối cảnh + phương án của từng điểm nằm trong nhật ký (`TC-n`). Danh sách đầy đủ: [journal/README.md](journal/README.md#điểm-tranh-cãi).

| TC | Câu hỏi | Trạng thái | Nhật ký |
|---|---|---|---|
| TC-1 | Layered (chuẩn team) hay clean architecture? | tạm chọn clean — **chờ Hiếu** | [001](journal/001-nen-tang-kien-truc.md) |
| TC-2 | Mỗi context một Nest module hay 1 composition root? | tạm chọn module | [001](journal/001-nen-tang-kien-truc.md) |
| TC-7 | Hợp đồng V3/E1 là DRAFT — cần code Python để đối chiếu | **mở — cần Hiếu cung cấp** | [002](journal/002-mock-ai-engine.md) |
| TC-9 | D5: client ngắt kết nối có huỷ lượt không? | **mở — chốt với FE trước W4** | [002](journal/002-mock-ai-engine.md) |
| TC-10 | Xoá project đang có hội thoại: gỡ / chặn / xoá theo? | **mở** (nghiêng gỡ liên kết) | [003](journal/003-projects.md) |
| TC-11 | Giới hạn 20.000 ký tự cho instructions | tạm chọn | [003](journal/003-projects.md) |
| TC-15 | Staging có bật Swagger không? | tạm chọn: không | [004](journal/004-swagger.md) |
| TC-17 | Email có phân biệt hoa/thường khi đăng nhập? | **mở** — tạm giữ nguyên như DB | [005](journal/005-dang-ky-dang-nhap.md) |
| TC-18 | Chặn mật khẩu > 72 byte khi đăng ký | tạm chọn | [005](journal/005-dang-ky-dang-nhap.md) |
| TC-19 | Thời hạn refresh token (đang 30 ngày) | **chờ Hiếu** | [005](journal/005-dang-ky-dang-nhap.md) |
| TC-20 | Gộp auth + users thành context `identity` | tạm chọn | [005](journal/005-dang-ky-dang-nhap.md) |
| — | Feedback trùng: 409 `feedback_exists` hay upsert? | mở — sẽ ghi TC khi làm FB-01 | — |
| — | Nguồn khoá JWT/Fernet (R25): env cho mọi service, NestJS không tự sinh | theo spec | — |

## Ghi chú review

_(Hiếu ghi nhận xét ở đây hoặc comment trong code; Claude xử lý xong thì gạch đi.)_

## Nhật ký

| Ngày | Ai | Việc |
|---|---|---|
| 2026-11-09 | 🤖 | Phase 0: skeleton, mock AI Engine, module mẫu projects, tài liệu tra cứu. `pnpm verify` xanh; chạy thật với Postgres: CRUD projects, 401/400/404, outbox `project.deleted`, stream mock qua playground. |
| 2026-11-09 | 🤖 | Đổi phân vai: Claude làm chính toàn bộ, Hiếu review. Thêm Swagger (F-16). Sửa build: tắt `incremental` trong `tsconfig.build.json` (Nest xoá `dist/` nhưng `.tsbuildinfo` làm tsc không emit). |
| 2026-11-09 | 🤖 | Thêm nhật ký chức năng `docs/journal/` (001–004) với điểm tranh cãi TC-1…TC-16 + lịch sử phiên bản; PLAN trỏ câu hỏi mở về TC. |
| 2026-11-09 | 🤖 | Lượt AUTH-01: signup/login, bcrypt `$2b$12$`, refresh token opaque (SHA-256), seed có mật khẩu thật. 33 test, verify xanh, chạy thật 12 kịch bản trên Postgres. |
| 2026-11-09 | 🤖 | Sửa `/docs` 404: biến env để trống bị parse thành `false`; giờ env rỗng = chưa đặt. Nhật ký 004 v1.1. |
