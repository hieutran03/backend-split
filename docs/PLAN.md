# PLAN — Chatbot Backend (NestJS)

> **Đây là anchor của dự án**: đang ở đâu, làm gì tiếp, ai làm. Mỗi khi xong / bắt đầu
> một task thì **sửa file này trong cùng commit**.
>
> Nguồn yêu cầu: artifact "Chatbot Backend Split" (tách phần quản lý/lưu trữ của chatbot
> FastAPI sang NestJS). Bản trích để tra cứu nằm ở [docs/reference/](reference/).

**Cập nhật lần cuối:** 2026-11-20 · **Giai đoạn hiện tại:** Phase 1 (W1) — **đủ task, chờ Hiếu review** (còn CONV-05 phụ thuộc bảng W2–W4) · **Tách database** (DS-01) chờ review — thiết kế ở [integration.md](integration.md)

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
4. Migration cho bảng mới **sinh bằng `pnpm db:migrate:generate`** (không viết tay), đọc lại đối chiếu
   [database-schema.md](reference/database-schema.md); `pnpm db:migrate:check` phải báo không còn khác biệt;
   `db:migrate:revert` rồi `db:migrate` chạy được.
5. Side effect chéo miền đi qua **outbox trong cùng transaction** (relay đẩy lên Redis Streams), không gọi Engine trực tiếp.
   Không Record/SQL nào chạm bảng Engine; cần dữ liệu Engine ⇒ E-API ([integration.md](integration.md)).
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
3. Có test user khác ⇒ 404 không? Side effect chéo miền đi qua outbox, payload đúng `src/contracts/events`?
4. Tên cột/bảng khớp [database-schema.md](reference/database-schema.md)?

---

## Phase 0 — Nền tảng & template ✅

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| F-01 | Khởi tạo NestJS 11 + pnpm + TS strict, alias `@shared @contracts @platform @modules` | 🤖 | [x] |
| F-02 | Kiến trúc sạch "vừa phải" + luật dependency-cruiser + ESLint chặn framework trong core | 🤖 | [x] |
| F-03 | Config zod (đọc env một chỗ), CoreModule (clock, id, JWT, AI engine) | 🤖 | [x] |
| F-04 | Database: TypeORM DataSource, `DbContext` (transaction qua AsyncLocalStorage), `backend_migrations` | 🤖 | [x] |
| F-05 | HTTP: envelope `{success, code, message, data}`, exception filter, ZodValidationPipe, JWT guard toàn cục, `@Public` `@AdminOnly` `@CurrentActor` `@RawResponse` | 🤖 | [x] |
| F-06 | Outbox port + `TypeOrmOutbox` (enqueue trong transaction) + bảng `outbox_events` | 🤖 | [x] |
| F-07 | Hợp đồng Engine (DRAFT): `TurnRequestV1`, `V3StreamEvent`, payload terminal, port `AiEngineClient` E1–E21 | 🤖 | [x] |
| F-08 | **Mock AI Engine** in-process, kịch bản bằng marker `[mock:*]` (xem [ai-engine-mock.md](ai-engine-mock.md)) | 🤖 | [x] |
| F-09 | `HttpAiEngineClient` (NDJSON reader, service token, X-Request-Id) — bản cơ bản | 🤖 | [x] |
| F-10 | Module mẫu **projects** PJ1–PJ5 đủ 4 tầng + unit test → **template để copy** | 🤖 | [x] |
| F-11 | Health `/health`, `/health/dependencies`; dev playground `POST /dev/engine/turns` | 🤖 | [x] |
| F-12 | docker-compose (Postgres 16, Redis 7, MinIO), migration dev baseline, seed 2 user, `token:dev` | 🤖 | [x] |
| F-13 | Tài liệu tra cứu sinh từ spec: route mapping, DB schema, engine contract | 🤖 | [x] |
| F-16 | **Swagger** `/docs` + `/docs-json`: schema sinh từ chính zod (`@ApiZodBody`, `@ApiZodQuery`, `@ApiEnvelope`, `@ApiErrors`), bearer auth; tắt ở production trừ khi `SWAGGER_ENABLED=true` | 🤖 | [x] |
| F-17 | **Migration sinh bằng script** từ entity (`db:migrate:generate`, `db:migrate:check`), bỏ baseline viết tay; Record khai đủ tên PK/FK/index — [nhật ký 009](journal/009-migration-sinh-bang-script.md) | 🤖 | [r] |
| F-14 | Integration test với Postgres thật (testcontainers hoặc docker compose) + CI (GitHub Actions/GitLab) | 🤖 | [ ] |
| F-15 | Request id middleware + log JSON (pino) + truyền `X-Request-Id` sang Engine | 🤖 | [ ] |

## Phase 1 — W1: Identity & đọc (31 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| AUTH-01 | Signup/login: bcrypt cost 12 tương thích `$2b$`, trùng email/username ⇒ 409; phát hành refresh token opaque — [nhật ký 005](journal/005-dang-ky-dang-nhap.md) | A1, A2 | 🤖 | [x] |
| AUTH-02 | Refresh token **opaque** xoay vòng (bảng `refresh_tokens`, SHA-256, `replaced_by_id`, thu hồi cả chuỗi khi dùng lại); logout thu hồi; refresh JWT cũ đổi 1 lần trong 7 ngày (D19) — [nhật ký 006](journal/006-refresh-logout.md) | A3, A4 | 🤖 | [x] |
| AUTH-03 | Guard kiểm claim `ver` với `users.token_version` + `deleted_at` (cache ≤ 30 s); admin từ `ADMIN_USER_IDS` → sau này `users.role` — [nhật ký 007](journal/007-guard-token-version.md) | — | 🤖 | [x] |
| USR-01 | `GET /users/me` — [nhật ký 008](journal/008-users-me.md) | A5 | 🤖 | [x] |
| CONV-01 | Conversations CRUD (tạo, xem, sửa, danh sách phân trang / lọc project / tìm tiêu đề); migration sinh bằng script — [nhật ký 010](journal/010-hoi-thoai-crud.md). Xoá ⇒ CONV-02 | A7–A9, A11, A21–A24 | 🤖 | [r] |
| CONV-02 | Xoá hội thoại: xoá mềm + outbox `conversation.deleted` (threadIds), khoá dòng chống xoá trùng; lượt active **không** chặn (TC-33) — [nhật ký 011](journal/011-xoa-hoi-thoai.md) | A12, A25 | 🤖 | [r] |
| CONV-03 | Fork: REPEATABLE READ (retry 40001) dưới khoá lượt nguồn (advisory lock trong DB backend), fingerprint sha256, replay 200/409/410, 413, outbox `conversation.forked` — [nhật ký 017](journal/017-fork-hoi-thoai.md) | A12a | 🤖 | [r] |
| MSG-01 | Messages đọc: `GET /messages/{id}`, list theo hội thoại (S2, mặc định `-sequence` — TC-39), list của tôi, `sender` số ⇒ chuỗi; bảng `messages` sinh bằng script — [nhật ký 012](journal/012-doc-tin-nhan.md) | A10, A19, A20 | 🤖 | [r] |
| CONV-04 | Danh sách hội thoại: `include=messages` + `latestMessages` (0..20), `messageCount`, `include=feedback` ⇒ 400, tìm cả nội dung tin nhắn (TC-31, TC-36) — [nhật ký 013](journal/013-danh-sach-hoi-thoai-kem-tin-nhan.md) | A9 | 🤖 | [r] |
| MSG-02 | Projection UIMessage cho AI SDK (`?format=ui-message`) — port `ai_sdk_projection.py` + parser marker/sanitizer, 65 test vàng sinh từ Python; metadata làm sạch như `MessageRead` — [nhật ký 020](journal/020-ui-message-projection.md) | A26 | 🤖 | [r] |
| FB-01 | Feedback: 1 feedback/message, rating 1–5, 409 `feedback_exists`, ownership qua message; `include=feedback` cho A10/A20 — [nhật ký 014](journal/014-feedback.md) | A30, A32–A34 | 🤖 | [r] |
| TP-01 | Task plans CRUD + complete + planning-status; bảng `task_plans` (enum `task_status`, unique DEFERRABLE INITIALLY DEFERRED) sinh bằng script — [nhật ký 016](journal/016-task-plans.md) | A36–A42 | 🤖 | [r] |
| TP-02 | Tính lại `conversations.plan_lifecycle` sau mỗi thay đổi task (port `TaskPlanService`: thêm ⇒ draft + bật planning; sửa/hoàn thành/xoá ⇒ tính lại; cùng transaction, khoá hội thoại); `task_order` từ 0 — [nhật ký 019](journal/019-doi-chieu-hanh-vi-python.md) | A36–A42 | 🤖 | [r] |
| SYNC-02 | Đối chiếu hành vi Phase 1 với Python: fingerprint fork, tiêu đề "(fork)", giữ `sequence` khi copy, `conversation_turn_conflict`, preview cũ → mới, tìm kiếm theo độ liên quan, chuẩn hoá email (cả login) — [nhật ký 019](journal/019-doi-chieu-hanh-vi-python.md) | A2, A9, A12a | 🤖 | [r] |
| CONV-05 | Fork phần còn lại theo Python: viết lại metadata (`snapshot_fork_message`), bỏ ảnh không còn sở hữu, bỏ hidden transcript artifact, `fork_cutoff_eligible`, copy agent, kiểm generation/document (thứ tự kiểm ở 019) | A12a | 🤖 | [ ] cần bảng W2–W4 |
| PJ-05 | Hoàn thiện xoá project: khoá project → hội thoại; gỡ mọi hội thoại (`project_id = NULL`) trong cùng transaction — [nhật ký 015](journal/015-project-va-hoi-thoai.md) | PJ5 | 🤖 | [r] |
| PJ-06 | Gắn/gỡ hội thoại vào project (kiểm 2 phía, khoá project `FOR SHARE`); copy custom agent ⇒ PJ-08 — [nhật ký 015](journal/015-project-va-hoi-thoai.md) | PJ6, PJ7 | 🤖 | [r] |

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
| DOC-01 | Upload multipart (≤ 50 MB, đuôi hợp lệ, trùng tên theo `filename_key`) → S3 → row `documents` + event `document.uploaded` (cần BUS-01) | D1, D2 | 🤖 | [ ] |
| DOC-02 | Nhận event `document.processing_status_changed` (thay callback B1, cần BUS-02): fence `attemptId`, không lùi trạng thái, idempotent | ~~B1~~ | 🤖 | [ ] |
| DOC-03 | Get/list/patch/delete document (ownership qua conversation), processing-status; xoá ⇒ event `document.deleted` + xoá object S3 ngay sau commit (TC-70) | D3–D7 | 🤖 | [ ] |
| MED-01 | Chat image từ S3; web image proxy chống SSRF; tool result forward E10 | A47–A49 | 🤖 | [ ] |

## Phase 4 — W4: Lượt chat & HITL (13 route) — phần khó nhất

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| GEN-01 | `TurnLock`: advisory xact lock trong DB backend (port `ConversationTurnLock` đã có từ CONV-03), connection riêng, poll 50 ms ≤ 30 s ⇒ 409 `conversation_turn_conflict` | — | 🤖 | [ ] |
| GEN-02 | Domain `Generation` state machine + version fence + bảng `generations`, `generation_commands` | — | 🤖 | [ ] |
| GEN-03 | Gom body E1 (persona, `documents[]` = phạm vi RAG, project instructions, custom agents, hitl policy, **`modelRuntime` key đã giải mã**, `history.throughSequence`) qua port của từng module | — | 🤖 | [ ] |
| GEN-04 | `TurnOrchestrator`: lock → user message + generation (lease 30 s) → E1 → gia hạn lease 10 s → persist terminal (assistant msg, chat_images, web_image_refs, task_plans) + event `conversation.turn_persisted` → unlock. Client ngắt không huỷ lượt | A13, A14 | 🤖 | [ ] |
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
| RDS-01 | Redis module + key schema `client-runtime:*`, `widget:*`, `interrupt:*` (không đổi tên key) viết thành hợp đồng `src/contracts/redis/` ([integration.md §7](integration.md)) | — | 🤖 | [ ] |
| DEV-01 | Client devices register/heartbeat/list/tool-catalog/skill-catalog/connected | C1–C6, R2 | 🤖 | [ ] |
| DEV-02 | WS gateway `/ws/device-runtime/{deviceId}` (ws adapter, BLPOP connection riêng) | R1 | 🤖 | [ ] |
| HS-01 | Tool approval settings theo device | A43–A45 | 🤖 | [ ] |
| WGT-01 | Widgets connection/action + WS `/ws/widgets` (JWT widget secret riêng, đóng 1008 khi sai token) | W1r–W3r | 🤖 | [ ] |

## Phase 6 — W6: Vận hành (16 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| OBX-02 | ~~Outbox publisher → E2/E5/E8/E9~~ — thay bằng **BUS-01** (relay → Redis Streams) | — | 🤖 | gộp vào BUS-01 |
| OBX-03 | Admin outbox: list + retry + phát lại theo khoảng thời gian (đối soát khi nghi mất event) | mới | 🤖 | [ ] |
| SCH-01 | Scheduler: lease reaper ⇒ event `generation.lease_expired`, interrupt expiry (mỗi phút) ⇒ `interrupt.expired`, sweep document kẹt > 1 h (chuyển từ Celery của Python về backend) | — | 🤖 | [ ] |
| USG-01 | Usage capabilities/dashboard/conversation (E11, E12); Engine chỉ trả id hội thoại ⇒ backend ghép tiêu đề, bỏ hội thoại đã xoá | A50–A52 | 🤖 | [ ] |
| OPS-01 | Health dependencies đủ (Redis, S3, Engine deep), `/metrics` Prometheus (gồm streaming H15) | H9–H13, H15 | 🤖 | [ ] |

## Tách database & kênh giao tiếp (từ 2026-11-20)

Backend và Engine dùng **database riêng**; thiết kế ở [integration.md](integration.md). Thứ tự đề xuất: BUS-01 trước W3
(DOC-01 cần), BUS-02 trước DOC-02, INT-01 trước khi ghép W4 với Engine thật, ETL-01 trước cutover.

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| DS-01 | Thiết kế tách DB + kênh giao tiếp; hợp đồng sự kiện (`src/contracts/events`) và B-API (`src/contracts/backend`); outbox có kiểu theo hợp đồng; gỡ E5/E8/E9/B1 khỏi port Engine; E1/E3/E4 mang `modelRuntime`, `history`; máy canh `app.entities.spec.ts`; sửa toàn bộ tài liệu — [nhật ký 021](journal/021-tach-database.md) | 🤖 | [r] |
| BUS-01 | Event bus phía phát: port publisher + adapter Redis Streams (`XADD` + `WAITAOF`, `MINID` 7 ngày), relay outbox (poll 2 s, `FOR UPDATE SKIP LOCKED`, backoff 5 s × 2ⁿ ≤ 12 lần) — thay OBX-02; mock Engine tiêu thụ event (giả lập index tài liệu) | 🤖 | [ ] |
| BUS-02 | Event bus phía nhận: consumer group `backend` trên `bus:engine:events`, bảng `inbox_events`, `XAUTOCLAIM` 60 s, DLQ sau 10 lần, metric lag | 🤖 | [ ] |
| INT-01 | B-API B2–B4 + `ServiceTokenGuard` (token Engine → backend riêng), chặn `/internal/*` ở gateway; B4 `no-store`, không log | 🤖 | [ ] |
| ETL-01 | Script chép 22 bảng backend từ DB cũ sang DB backend (đếm dòng + checksum từng bảng), diễn tập trên bản sao | 🤖 | [ ] |
| ENG-04 | Bàn giao + theo dõi checklist phía Engine ([integration.md §11](integration.md)) — không sửa repo chatbot trong repo này | 🤖 + người làm Engine | [ ] |

## Song song suốt dự án

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| SYNC-01 | Đồng bộ schema 6 bảng Phase 1 với DB dựng bằng Alembic (dump `python-schema.sql`, tên FK/PK thật, default DB, CHECK, index FTS) — [nhật ký 018](journal/018-dong-bo-schema-alembic.md) | 🤖 | [r] |
| SYNC-03 | Đồng bộ artifact ↔ repo ↔ Python `80d9bc9b`: mục ◆ trong artifact, script `sync-route-mapping.mjs`, cờ rich E1/E3/E4; danh sách "Việc Hiếu bắt buộc quyết" — [nhật ký 018 v1.1](journal/018-dong-bo-schema-alembic.md) | 🤖 | [r] |
| ENG-01 | Đối chiếu & freeze hợp đồng V3/E1 với code Python (`events.py`, `workflow.py`, `ai_sdk_v6.py`, `internal_sse.py`) — đã có repo chatbot, làm trước W4 | 🤖 | [ ] |
| ENG-02 | Mock Engine **dạng HTTP server** riêng (`pnpm mock:engine`) để test `HttpAiEngineClient` + timeout im lặng | 🤖 | [ ] |
| ENG-03 | Cứng hoá `HttpAiEngineClient`: retry call idempotent, circuit breaker, timeout im lặng 5 s × 3 | 🤖 | [ ] |
| LEG-01 | Lớp tương thích route cũ (envelope cũ, snake_case, sender số, header Deprecation/Sunset, counter) | 🤖 | [ ] |
| SEC-01 | Đối chiếu §9.3 lỗi bảo mật: không bypass qua đường cũ | 🤖 | [ ] |

---

## Việc Hiếu bắt buộc quyết (Claude nhắc khi tới mốc)

Lọc từ bảng TC bên dưới: chỉ những điểm ảnh hưởng chính sách bảo mật, FE, hoặc mâu thuẫn với spec.
Mọi TC khác là lựa chọn kỹ thuật Claude tự chịu, đã ghi lý do trong nhật ký. Chưa quyết thì Claude giữ
phương án đang chạy và **hỏi lại đúng lúc bắt đầu mốc** ghi ở cột cuối.

| # | Cần quyết | Đang chạy tạm | Vì sao phải là Hiếu | Hạn chót |
|---|---|---|---|---|
| Q1 | Thời hạn refresh token (TC-19) | 30 ngày (Python: 7 ngày; access 15 phút, Python 600 phút) | Chính sách bảo mật / trải nghiệm đăng nhập | Trước cutover (xem Q10) |
| Q2 | Refresh xoay vòng nghiêm ngặt ⇒ FE/sidecar phải gọi refresh **tuần tự** (TC-21) | Nghiêm ngặt: dùng lại vé cũ ⇒ huỷ cả chuỗi | Ràng buộc mới với FE, Python không có | Trước cutover (xem Q10) — cần FE đồng ý |
| Q3 | Logout "mọi thiết bị" có vô hiệu luôn access token đang sống (tăng `token_version`) không (TC-22) | Không | Chính sách bảo mật | Trước cutover (xem Q10) |
| Q4 | Client ngắt kết nối có huỷ lượt chat không (TC-9, D5) | Spec D5: không huỷ; Python hiện **huỷ** | Mâu thuẫn spec ↔ hành vi hiện tại, FE thấy được | Trước GEN-04 (W4) |
| Q5 | Xoá hội thoại đang có lượt chạy: cho xoá (như Python, A12) hay 409 (spec D24) (TC-33) | Cho xoá | Mâu thuẫn trong chính spec | Trước GEN-04 (W4) |
| Q6 | Cho phép **một** migration viết tay `AlembicOnlyDifferences` (TC-36). Sau khi tách DB, phần bắt buộc chỉ còn index FTS; tên PK/CHECK chỉ để giống Alembic | Đã dùng | Trái quy tắc anh đặt ở F-17 | Khi review SYNC-01 |
| Q7 | GET planning-status được ghi DB (bật planning mode như Python) (TC-60) | Giữ như Python | GET có tác dụng phụ — quy ước API | Khi review TP-02 |
| Q8 | Kiến trúc clean (đang dùng) hay layered theo chuẩn team (TC-1) | Clean | Chuẩn team; đổi muộn rất tốn | Càng sớm càng tốt |
| Q9 | Bus sự kiện: **Redis Streams** hay RabbitMQ (TC-65) | Redis Streams — hai bên đã có Redis, bật AOF; relay dùng `WAITAOF` | Hạ tầng/vận hành, chuẩn team | Trước BUS-01 |
| Q10 | Cutover: **một lần** sau khi đủ W1–W6 (ETL-01) hay từng đợt + đồng bộ tạm DB backend → DB cũ (TC-68) | Một lần | Đổi lịch ra production; quyết định hạn của Q1–Q3 | Càng sớm càng tốt |
| Q11 | Gửi key provider **đã giải mã** sang Engine (E1, B4) hay Engine giữ khoá Fernet (TC-67) | Đã giải mã, mạng nội bộ có TLS, không log | Chính sách bảo mật bí mật của user | Trước GEN-03 / PRV-01 |
| Q12 | Ai làm checklist phía Engine (integration.md §11), khi nào | — | Phân công người/đội ngoài repo này | Trước khi ghép W4 với Engine thật |

## Câu hỏi / quyết định đang mở

Chi tiết bối cảnh + phương án của từng điểm nằm trong nhật ký (`TC-n`). Danh sách đầy đủ: [journal/README.md](journal/README.md#điểm-tranh-cãi).

| TC | Câu hỏi | Trạng thái | Nhật ký |
|---|---|---|---|
| TC-1 | Layered (chuẩn team) hay clean architecture? | tạm chọn clean — **chờ Hiếu** | [001](journal/001-nen-tang-kien-truc.md) |
| TC-2 | Mỗi context một Nest module hay 1 composition root? | tạm chọn module | [001](journal/001-nen-tang-kien-truc.md) |
| TC-7 | Hợp đồng V3/E1 là DRAFT — cần code Python để đối chiếu | **mở — cần Hiếu cung cấp** | [002](journal/002-mock-ai-engine.md) |
| TC-9 | D5: client ngắt kết nối có huỷ lượt không? | **mở — chốt với FE trước W4** | [002](journal/002-mock-ai-engine.md) |
| TC-10 | Xoá project đang có hội thoại: gỡ / chặn / xoá theo? | **đóng** — gỡ (spec PJ5) | [003](journal/003-projects.md), [015](journal/015-project-va-hoi-thoai.md) |
| TC-11 | Giới hạn 20.000 ký tự cho instructions | tạm chọn | [003](journal/003-projects.md) |
| TC-15 | Staging có bật Swagger không? | tạm chọn: không | [004](journal/004-swagger.md) |
| TC-17 | Email có phân biệt hoa/thường khi đăng nhập? | **đóng** — chuẩn hoá như Python (domain chữ thường) | [005](journal/005-dang-ky-dang-nhap.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-18 | Chặn mật khẩu > 72 byte khi đăng ký | **đóng** — khớp Python | [005](journal/005-dang-ky-dang-nhap.md) |
| TC-19 | Thời hạn refresh token (đang 30 ngày; Python 7 ngày, access 600 phút) | **chờ Hiếu** | [005](journal/005-dang-ky-dang-nhap.md) |
| TC-20 | Gộp auth + users thành context `identity` | tạm chọn | [005](journal/005-dang-ky-dang-nhap.md) |
| TC-21 | Refresh song song cùng một vé: nghiêm ngặt (huỷ chuỗi) hay ân hạn? | tạm chọn nghiêm ngặt — **FE phải refresh tuần tự** (Python không xoay vòng ⇒ ràng buộc mới với FE) | [006](journal/006-refresh-logout.md) |
| TC-22 | Logout `allDevices` có vô hiệu luôn access token (tăng `token_version`)? | **chờ Hiếu** | [006](journal/006-refresh-logout.md) |
| TC-23 | Logout bằng vé người khác ⇒ 200 `revokedCount: 0` | tạm chọn | [006](journal/006-refresh-logout.md) |
| TC-24 | Logout cần access token | tạm chọn | [006](journal/006-refresh-logout.md) |
| TC-25 | Hai lý do lỗi `user_inactive` / `token_revoked` | tạm chọn | [007](journal/007-guard-token-version.md) |
| TC-26 | Cache trạng thái user trong process (30 s) hay Redis | tạm chọn process | [007](journal/007-guard-token-version.md) |
| TC-27 | Token Python không có `ver` ⇒ coi là 0 | theo spec | [007](journal/007-guard-token-version.md) |
| TC-28 | `outbox_events.aggregate_id` varchar thay vì uuid | tạm chọn | [009](journal/009-migration-sinh-bang-script.md) |
| TC-29 | Biểu thức CHECK `ck_conversations_fork_request_fields_together` | **đóng** — lấy từ Alembic | [009](journal/009-migration-sinh-bang-script.md), [018](journal/018-dong-bo-schema-alembic.md) |
| TC-30 | Không format lại file migration sinh ra | tạm chọn | [009](journal/009-migration-sinh-bang-script.md) |
| TC-31 | Tìm hội thoại: tiêu đề hoặc nội dung tin, xếp theo độ liên quan, bỏ qua sort | **đóng** — port Python | [010](journal/010-hoi-thoai-crud.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-32 | `planningModeEnabled: null` khi sửa ⇒ 400 | **đóng** — khớp Python (422) | [010](journal/010-hoi-thoai-crud.md) |
| TC-33 | Xoá hội thoại đang có lượt active: không chặn (A12) hay 409 (D24)? | tạm chọn không chặn (khớp Python) — **chờ Hiếu** | [011](journal/011-xoa-hoi-thoai.md) |
| TC-34 | `threadIds` chụp lúc xoá (trong payload) hay bộ phát tự truy vấn | tạm chọn lúc xoá | [011](journal/011-xoa-hoi-thoai.md) |
| TC-35 | Module messages join thẳng bảng `conversations` (chỉ đọc) để kiểm sở hữu | tạm chọn — **Hiếu xem** | [012](journal/012-doc-tin-nhan.md) |
| TC-36 | Index FTS `idx_messages_content_simple_fts`: biểu thức đã có; 1 migration viết tay `AlembicOnlyDifferences` | **chờ Hiếu duyệt ngoại lệ viết tay** | [012](journal/012-doc-tin-nhan.md), [018](journal/018-dong-bo-schema-alembic.md) |
| TC-37 | MessageView: thêm `sequence`; chưa có `feedback`/`interrupt`/`suggestedQuestions` | tạm chọn | [012](journal/012-doc-tin-nhan.md) |
| TC-38 | `include=feedback` ⇒ 400 tới FB-01 | **đóng** — đã bật ở FB-01 | [012](journal/012-doc-tin-nhan.md), [014](journal/014-feedback.md) |
| TC-39 | Tin nhắn phân trang S2 thay vì cursor | theo spec | [012](journal/012-doc-tin-nhan.md) |
| TC-40 | `messageCount` luôn có trong danh sách hội thoại (Python: chỉ khi `include=messages`) | tạm chọn — tập lớn hơn | [013](journal/013-danh-sach-hoi-thoai-kem-tin-nhan.md) |
| TC-41 | `messages` trong item: N mới nhất, trả cũ → mới | **đóng** — theo Python | [013](journal/013-danh-sach-hoi-thoai-kem-tin-nhan.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-42 | Biểu thức CHECK `ck_feedbacks_rating_range` (`>= 1 AND <= 5`) | **đóng** — giống hệt DB thật | [014](journal/014-feedback.md) |
| TC-43 | Unique `feedbacks.message_id` không partial (xoá mềm vẫn chiếm chỗ) | theo spec | [014](journal/014-feedback.md) |
| TC-44 | Module projects ghi cột `conversations.project_id` (SQL theo tên bảng) | tạm chọn — **Hiếu xem** | [015](journal/015-project-va-hoi-thoai.md) |
| TC-45 | Copy custom agent của project khi gắn/tạo hội thoại ⇒ PJ-08 | hoãn | [015](journal/015-project-va-hoi-thoai.md) |
| TC-46 | Gắn/gỡ đổi `updated_at` của hội thoại | **đóng** — khớp Python | [015](journal/015-project-va-hoi-thoai.md) |
| TC-47 | Response PJ6/PJ7 `{ conversationId, projectId }` (Python: `data: null`) | tạm chọn — tập lớn hơn | [015](journal/015-project-va-hoi-thoai.md) |
| TC-48 | Ghi `plan_lifecycle` theo quy tắc Python (TP-02) | **đóng** | [016](journal/016-task-plans.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-49 | `progressPercentage` (completed/total) và `nextTask` (in_progress rồi pending) | **đóng** — khớp Python | [016](journal/016-task-plans.md) |
| TC-50 | Xoá task không đánh lại `task_order` | **đóng** — khớp Python | [016](journal/016-task-plans.md) |
| TC-51 | `task_order` bắt đầu từ 0 (trước: 1) | **đóng** — theo Python | [016](journal/016-task-plans.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-52 | A36/A37 trả mảng, không phân trang | **đóng** — khớp Python | [016](journal/016-task-plans.md) |
| TC-53 | Fingerprint fork = công thức Python (JSON object khoá sắp xếp) | **đóng** | [017](journal/017-fork-hoi-thoai.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-54 | Con copy persona, planning, project; tiêu đề mặc định "(fork)"; giữ `sequence` gốc; metadata/agent ⇒ CONV-05 | đóng phần W1 | [017](journal/017-fork-hoi-thoai.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-55 | "32 MB" = content + metadata text (bytes) | **đóng** — khớp Python | [017](journal/017-fork-hoi-thoai.md) |
| TC-56 | Fork: kiểm generation active / documents / copy custom agent khi có bảng (W2–W4) | hoãn ⇒ CONV-05 (quy tắc đã có) | [017](journal/017-fork-hoi-thoai.md), [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-57 | Chờ khoá lượt > 30 s ⇒ 409 `conversation_turn_conflict` (như Python) | **đóng** | [017](journal/017-fork-hoi-thoai.md) |
| TC-58 | Fork trả `message: "OK"` cho cả 201 và 200 (Python: 2 câu riêng; user khác 403 — NestJS giữ 404) | tạm chọn | [017](journal/017-fork-hoi-thoai.md) |
| TC-59 | Tên ràng buộc theo dump Alembic (`fk_*`, `feedback_pkey`…) thay vì quy ước tự đoán | tạm chọn | [018](journal/018-dong-bo-schema-alembic.md) |
| TC-60 | GET planning-status bật planning mode khi có task (giống Python) | tạm chọn — **Hiếu xem** | [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-61 | Ghi lifecycle trong cùng transaction (Python: sau commit) | tạm chọn | [019](journal/019-doi-chieu-hanh-vi-python.md) |
| TC-62 | `include=feedback` cùng `format=ui-message` ⇒ 400 | tạm chọn | [020](journal/020-ui-message-projection.md) |
| TC-63 | Nhận cờ rich dạng snake_case + bool kiểu FastAPI | tạm chọn | [020](journal/020-ui-message-projection.md) |
| TC-64 | Làm sạch metadata ở mọi MessageView (như Python) | tạm chọn — sửa lỗi lộ `original_image_url` | [020](journal/020-ui-message-projection.md) |
| TC-65 | Bus sự kiện Redis Streams hay RabbitMQ | tạm chọn Redis Streams — **chờ Hiếu (Q9)** | [021](journal/021-tach-database.md) |
| TC-66 | Lịch sử chat: Engine kéo qua B2 hay backend đẩy trong E1, hay Engine giữ bản sao | tạm chọn kéo qua B2 | [021](journal/021-tach-database.md) |
| TC-67 | Key provider đã giải mã đi trong E1/B4 | tạm chọn — **chờ Hiếu (Q11)** | [021](journal/021-tach-database.md) |
| TC-68 | Cutover dữ liệu một lần (ETL) thay vì từng đợt | tạm chọn — **chờ Hiếu (Q10)** | [021](journal/021-tach-database.md) |
| TC-69 | DB riêng nhưng giữ tên cột/ràng buộc như Alembic (chép 1:1), dọn sau cutover | tạm chọn | [021](journal/021-tach-database.md) |
| TC-70 | Xoá tài liệu: backend xoá object ngay sau commit, không chờ Engine gỡ index | tạm chọn | [021](journal/021-tach-database.md) |
| TC-71 | Engine tự dừng run khi nhận `conversation.deleted` (thay backend gọi E2 rồi E5) | tạm chọn | [021](journal/021-tach-database.md) |
| TC-72 | Gỡ E5/E8/E9/B1 khỏi port Engine ngay, giả lập index tài liệu trong mock hoãn tới BUS-01 | tạm chọn | [021](journal/021-tach-database.md) |
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
| 2026-11-09 | 🤖 | Chuyển comment, chuỗi text trong code, file cấu hình sang tiếng Anh (tài liệu giữ tiếng Việt) — luật số 9 trong AGENTS.md. Sửa 3 file lệch prettier lọt vào `1b0a276`. |
| 2026-11-09 | 🤖 | Lượt AUTH-02: refresh xoay vòng + phát hiện dùng lại (thu hồi chuỗi), logout thu hồi thật, đổi refresh JWT cũ một lần (D19). 58 test; chạy thật 18 kịch bản + test đồng thời 5 request × 3 lần trên Postgres. |
| 2026-11-09 | 🤖 | Lượt AUTH-03: guard kiểm `deleted_at` + `token_version` qua port `UserTokenStateReader` (identity cài đặt, cache ≤ 30 s có giới hạn). 70 test; chạy thật 9 kịch bản trên 2 instance (có/không cache). |
| 2026-11-09 | 🤖 | Lượt USR-01: `GET /users/me`. Cụm tài khoản W1 (A1–A5) đủ. 72 test; chạy thật. |
| 2026-11-10 | 🤖 | Hiếu duyệt Phase 0 + AUTH-01..03 + USR-01. F-17: migration sinh bằng script; reset DB local; `InitialSchema` đi qua migrate → check → revert → migrate → check. |
| 2026-11-10 | 🤖 | Lượt CONV-01: hội thoại A7/A8/A9/A11; `ProjectLookup` công khai + adapter (giao tiếp module qua port); migration `AddConversations` sinh bằng script, qua check/revert. 79 test; chạy thật 14 kịch bản. |
| 2026-11-11 | 🤖 | Lượt CONV-02: xoá hội thoại (A12/A25) — xoá mềm + outbox `conversation.deleted` trong 1 transaction, `FOR UPDATE` chống ghi 2 event; không đổi schema (`db:migrate:check` sạch). 81 test; chạy thật 6 kịch bản + 5 lệnh xoá đồng thời × 3 lần ⇒ đúng 1 event. |
| 2026-11-11 | 🤖 | Lượt MSG-01: module `messages` (A10/A19/A20, chỉ đọc), `sender` số ⇒ chuỗi (S4); migration `AddMessages` (+ FK `forked_from_message_id`) sinh bằng script, qua check/revert. 88 test; chạy thật 14 kịch bản. Tách phần mở rộng A9 thành CONV-04. |
| 2026-11-11 | 🤖 | Lượt CONV-04: A9 `messageCount`, `include=messages` + `latestMessages` (2 truy vấn set-based / trang), tìm theo nội dung tin. 91 test; chạy thật 11 kịch bản. |
| 2026-11-11 | 🤖 | Lượt FB-01: module `feedback` (A30, A32–A34; A31 bỏ), 409 `feedback_exists` (kiểm trước + unique index), `include=feedback` cho A10/A20; migration `AddFeedbacks` sinh bằng script, qua check/revert. 98 test; chạy thật 13 kịch bản + 5 POST đồng thời ⇒ 1 dòng. |
| 2026-11-11 | 🤖 | Lượt PJ-06 + PJ-05: gắn/gỡ hội thoại; xoá project gỡ mọi hội thoại trong cùng transaction (khoá project → hội thoại); A7 khoá project khi tạo trong project. 102 test; chạy thật 11 kịch bản + race xoá/gắn/tạo × 3 ⇒ 0 hội thoại trỏ vào project đã xoá. |
| 2026-11-11 | 🤖 | Lượt TP-01: module `task-plans` (A36–A42), `completedAt` theo `status`, khoá hội thoại khi thêm việc; migration `AddTaskPlans` sinh bằng script (enum + unique deferrable), qua check/revert. Tách TP-02 [!] (tính `plan_lifecycle`, cần Python). 108 test; chạy thật 14 kịch bản + 5 lệnh thêm đồng thời ⇒ thứ tự 1..12 không trùng. |
| 2026-11-11 | 🤖 | Lượt CONV-03: fork A12a; port `ConversationTurnLock` (advisory lock §11, connection riêng) + retry 40001 trong `TransactionManager`; copy prefix qua public API của messages; mã lỗi 413. 116 test; chạy thật 13 kịch bản (race 5 request ⇒ 1 con; chờ khoá do psql giữ ≈ 2,7 s; 413 ở 5.002 tin). |
| 2026-11-18 | 🤖 | SYNC-01: dựng DB bằng Alembic của repo chatbot (head `c4f1a7b9d2e6`), lưu dump `docs/reference/python-schema.sql`; sửa 5 Record (tên FK/PK thật, default DB, 2 CHECK, index FTS); migration `AlignWithAlembicSchema` (sinh) + `AlembicOnlyDifferences` (viết tay). Diff catalog 6 bảng chỉ còn `users.role`; `check` trên DB Alembic chỉ đòi `refresh_tokens`, `outbox_events`, `users.role`. 116 test xanh. |
| 2026-11-18 | 🤖 | TP-02 + SYNC-02: đọc code Python trả lời TC-17…58; port quy tắc `plan_lifecycle`, `task_order` từ 0; fork theo Python (fingerprint, "(fork)", giữ `sequence`, `conversation_turn_conflict`); preview cũ → mới; tìm kiếm theo độ liên quan; chuẩn hoá email cả login (bắt được lỗi login chưa chuẩn hoá). Tách CONV-05. 141 test; chạy thật 23 kịch bản trên Postgres. |
| 2026-11-18 | 🤖 | MSG-02: port projection UIMessage (marker parser, sanitizer, source figure, ảnh, nguồn web) sang domain thuần; script sinh 65 trường hợp vàng bằng code Python thật, test TS khớp 100 %; `format=ui-message` + 3 cờ rich trên A10; làm sạch metadata ở MessageView như `MessageRead`. 212 test; chạy thật 9 kịch bản. Phase 1 đủ task. |
| 2026-11-18 | 🤖 | SYNC-03: artifact spec lên version 9 (mục ◆ đối chiếu 18/11, sửa 4 dòng §11 sai, ghi chú 7 route); route-mapping sinh bằng script từ artifact; hợp đồng E1/E3/E4 thêm cờ rich; lập danh sách Q1–Q8 Hiếu bắt buộc quyết (có hạn chót). |
| 2026-11-20 | 🤖 | DS-01: tách database backend ↔ Engine theo yêu cầu Hiếu — thiết kế [integration.md](integration.md) (API E/B, sự kiện Redis Streams + outbox/inbox, key Redis dùng chung, ETL cutover); hợp đồng `src/contracts/events`, `src/contracts/backend`; outbox có kiểu theo hợp đồng; bỏ E5/E8/E9/B1; máy canh bảng Engine; kiểm kê 20 FK chéo từ dump Alembic; thêm Q9–Q12, TC-65…72. 216 test xanh. |
| 2026-11-20 | 🤖 | DS-01 v1.1: artifact spec lên version 11 — sửa thẳng nội dung toàn trang theo DB riêng (bản 10 mới chỉ thêm mục ◇); kiểm 40 sơ đồ tham chiếu đúng làn, 4 khối script qua `node --check`; route-mapping sinh lại (B2–B4 thay B1); sửa mã route D5 ⇒ D7. |
