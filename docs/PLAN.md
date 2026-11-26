# PLAN — Chatbot Backend (NestJS)

> **Đây là anchor của dự án**: đang ở đâu, làm gì tiếp, ai làm. Mỗi khi xong / bắt đầu
> một task thì **sửa file này trong cùng commit**.
>
> Nguồn yêu cầu: artifact "Chatbot Backend Split" (tách phần quản lý/lưu trữ của chatbot
> FastAPI sang NestJS). Bản trích để tra cứu nằm ở [docs/reference/](reference/).
> Thuật ngữ và ký hiệu: [glossary.md](glossary.md). Kiến trúc: [architecture.md](architecture.md).

**Cập nhật lần cuối:** 2026-11-26

**Đang ở đâu:** nền tảng và đợt W1 (tài khoản & dữ liệu đọc) đã code xong, **chờ Hiếu review**. Riêng phần còn lại
của fork (CONV-05) phải chờ các bảng của W2–W4. Thiết kế tách database ([integration.md](integration.md)) cũng chờ review.

**Phạm vi của file này:** phần việc của backend, tức giai đoạn P3 "xây NestJS" và phần backend của việc tách
database. Kế hoạch tổng 7 giai đoạn (P0–P6) và lịch cutover nằm ở artifact mục 10.

## Cách đọc

| Ký hiệu | Nghĩa |
|---|---|
| `[ ]` | Chưa làm |
| `[~]` | Claude đang làm (ghi ngày bắt đầu) |
| `[r]` | Code xong, `pnpm verify` xanh — **chờ Hiếu review** tính năng & kiến trúc |
| `[x]` | Hiếu đã review OK (hoặc đã sửa theo review) |
| `[!]` | Bị chặn — ghi lý do |

**Lượt làm (iteration):** mỗi vòng *nhận 1 task → code → test → chạy thật → nhật ký → `[r]` → commit*
là một **lượt làm** (khác "lượt chat" của người dùng); kết quả là một **increment** chạy được và review được (một lát cắt dọc qua 4 tầng).

**Quy trình:** Claude lấy task theo thứ tự trong PLAN (WIP = 1) → code + test → `[r]` + commit
→ Hiếu review (comment trực tiếp hoặc ghi vào mục "Ghi chú review" bên dưới) → Claude sửa → `[x]`.
Hiếu muốn đổi thứ tự ưu tiên thì sửa thứ tự hoặc ghi vào mục "Ghi chú review".

**Định nghĩa xong (DoD) cho một task module** (artifact mục 11):
1. Endpoint `/api/v1/...` đúng bảng [route-mapping.md](reference/route-mapping.md), envelope chuẩn.
2. Unit test use case (fake repo) — gồm test **user khác ⇒ 404**; route admin ⇒ 403 với user thường.
3. Domain/application không import framework (`pnpm test:architecture` xanh).
4. Migration cho bảng mới **sinh bằng `pnpm db:migrate:generate`** (không viết tay), đọc lại đối chiếu
   [database-schema.md](reference/database-schema.md); `pnpm db:migrate:check` phải báo không còn khác biệt;
   `db:migrate:revert` rồi `db:migrate` chạy được. Ngoại lệ duy nhất: thứ TypeORM không sinh được (index full-text
   theo biểu thức…) viết tay trong một migration riêng có comment lý do — hiện là `AlembicOnlyDifferences`.
5. Side effect chéo miền đi qua **outbox trong cùng transaction** (relay đẩy lên Redis Streams), không gọi Engine trực tiếp.
   Không Record/SQL nào chạm bảng Engine; cần dữ liệu Engine ⇒ gọi API Engine ([integration.md](integration.md)).
6. `pnpm verify` xanh. Chưa chạy thì ghi là chưa chạy, không tick khống.
7. **Nhật ký** `docs/journal/NNN-*.md`: phần dễ hiểu + kỹ thuật (code, request/response thật) +
   điểm tranh cãi `TC-n` + lịch sử phiên bản. Xem [journal/README.md](journal/README.md).

## Phân vai (chốt 2026-11-09)

- **Claude — làm chính toàn bộ:** mọi task trong PLAN (platform, module CRUD, phần khó),
  test, tài liệu, giữ PLAN luôn đúng trạng thái.
- **Hiếu — review:** duyệt tính năng (đúng spec, đúng hành vi FE cần) và kiến trúc; trả lời
  mục "Việc cần Hiếu quyết"; cung cấp tài liệu/code Python khi task bị chặn.

## Gợi ý review cho mỗi task `[r]`

1. Route/response có khớp [route-mapping.md](reference/route-mapping.md) không? Thử trên Swagger `/docs`.
2. Logic nghiệp vụ nằm ở `domain/`/`application/`, controller mỏng?
3. Có test user khác ⇒ 404 không? Side effect chéo miền đi qua outbox, payload đúng `src/contracts/events`?
4. Tên cột/bảng khớp [database-schema.md](reference/database-schema.md)?

---

## Nền tảng — dùng chung cho mọi đợt (còn F-14, F-15)

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

## Đợt W1 — Tài khoản & dữ liệu đọc (39 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| AUTH-01 | Signup/login: bcrypt cost 12 tương thích `$2b$`, trùng email/username ⇒ 409; phát hành refresh token opaque — [nhật ký 005](journal/005-dang-ky-dang-nhap.md) | A1, A2 | 🤖 | [x] |
| AUTH-02 | Refresh token **opaque** xoay vòng (bảng `refresh_tokens`, SHA-256, `replaced_by_id`, thu hồi cả chuỗi khi dùng lại); logout thu hồi; refresh JWT cũ của Python đổi được 1 lần trong 7 ngày (quyết định D19) — [nhật ký 006](journal/006-refresh-logout.md) | A3, A4 | 🤖 | [x] |
| AUTH-03 | Guard kiểm claim `ver` với `users.token_version` + `deleted_at` (cache ≤ 30 s); admin từ `ADMIN_USER_IDS` → sau này `users.role` — [nhật ký 007](journal/007-guard-token-version.md) | — | 🤖 | [x] |
| USR-01 | `GET /users/me` — [nhật ký 008](journal/008-users-me.md) | A5 | 🤖 | [x] |
| CONV-01 | Conversations CRUD (tạo, xem, sửa, danh sách phân trang / lọc project / tìm tiêu đề); migration sinh bằng script — [nhật ký 010](journal/010-hoi-thoai-crud.md). Xoá ⇒ CONV-02 | A7–A9, A11, A21–A24 | 🤖 | [r] |
| CONV-02 | Xoá hội thoại: xoá mềm + outbox `conversation.deleted` (threadIds), khoá dòng chống xoá trùng; lượt đang chạy **không** chặn xoá (chốt 26/11) — [nhật ký 011](journal/011-xoa-hoi-thoai.md) | A12, A25 | 🤖 | [r] |
| CONV-03 | Fork: REPEATABLE READ (retry 40001) dưới khoá lượt nguồn (advisory lock trong DB backend), fingerprint sha256, replay 200/409/410, 413, outbox `conversation.forked` — [nhật ký 017](journal/017-fork-hoi-thoai.md) | A12a | 🤖 | [r] |
| MSG-01 | Messages đọc: `GET /messages/{id}`, list theo hội thoại (phân trang chuẩn, mặc định `-sequence`), list của tôi, `sender` số ⇒ chuỗi; bảng `messages` sinh bằng script — [nhật ký 012](journal/012-doc-tin-nhan.md) | A10, A19, A20 | 🤖 | [r] |
| CONV-04 | Danh sách hội thoại: `include=messages` + `latestMessages` (0..20), `messageCount`, `include=feedback` ⇒ 400, tìm cả nội dung tin nhắn — [nhật ký 013](journal/013-danh-sach-hoi-thoai-kem-tin-nhan.md) | A9 | 🤖 | [r] |
| MSG-02 | Projection UIMessage cho AI SDK (`?format=ui-message`) — port `ai_sdk_projection.py` + parser marker/sanitizer, 65 test vàng sinh từ Python; metadata làm sạch như `MessageRead` — [nhật ký 020](journal/020-ui-message-projection.md) | A26 | 🤖 | [r] |
| FB-01 | Feedback: 1 feedback/message, rating 1–5, 409 `feedback_exists`, ownership qua message; `include=feedback` cho A10/A20 — [nhật ký 014](journal/014-feedback.md) | A30, A32–A34 | 🤖 | [r] |
| TP-01 | Task plans CRUD + complete + planning-status; bảng `task_plans` (enum `task_status`, unique DEFERRABLE INITIALLY DEFERRED) sinh bằng script — [nhật ký 016](journal/016-task-plans.md) | A36–A42 | 🤖 | [r] |
| TP-02 | Tính lại `conversations.plan_lifecycle` sau mỗi thay đổi task (port `TaskPlanService`: thêm ⇒ draft + bật planning; sửa/hoàn thành/xoá ⇒ tính lại; cùng transaction, khoá hội thoại); `task_order` từ 0 — [nhật ký 019](journal/019-doi-chieu-hanh-vi-python.md) | A36–A42 | 🤖 | [r] |
| SYNC-02 | Đối chiếu hành vi đợt W1 với Python: fingerprint fork, tiêu đề "(fork)", giữ `sequence` khi copy, `conversation_turn_conflict`, preview cũ → mới, tìm kiếm theo độ liên quan, chuẩn hoá email (cả login) — [nhật ký 019](journal/019-doi-chieu-hanh-vi-python.md) | A2, A9, A12a | 🤖 | [r] |
| CONV-05 | Fork phần còn lại theo Python: viết lại metadata (`snapshot_fork_message`), bỏ ảnh không còn sở hữu, bỏ hidden transcript artifact, `fork_cutoff_eligible`, copy agent, kiểm generation/document (thứ tự kiểm ở 019) | A12a | 🤖 | [ ] cần bảng W2–W4 |
| PJ-05 | Hoàn thiện xoá project: khoá project → hội thoại; gỡ mọi hội thoại (`project_id = NULL`) trong cùng transaction — [nhật ký 015](journal/015-project-va-hoi-thoai.md) | PJ5 | 🤖 | [r] |
| PJ-06 | Gắn/gỡ hội thoại vào project (kiểm 2 phía, khoá project `FOR SHARE`); copy custom agent ⇒ PJ-08 — [nhật ký 015](journal/015-project-va-hoi-thoai.md) | PJ6, PJ7 | 🤖 | [r] |

## Đợt W2 — Cấu hình (38 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| CRY-01 | Fernet/MultiFernet trong Node + test giải mã **một row thật** của `model_providers` | — | 🤖 | [ ] |
| PRV-01 | Providers CRUD, validate key, list models (gọi vendor, cache 6 h), `keyPreview` | P1–P6 | 🤖 | [ ] |
| AMC-01 | Agent model configs + options + reset (bảng default copy từ `AGENT_CONFIG` Python) | M1–M4 | 🤖 | [ ] |
| CA-01 | Custom agents CRUD (partial unique `owner_id, slug`), options | A53–A58 | 🤖 | [ ] |
| CA-02 | Validate tool ref qua E18 + catalog device Redis; guard "agent đang dùng" bằng query `generations` active + `hitl_interrupts` pending | A54, A57 | 🤖 | [ ] |
| CA-03 | Gắn custom agents vào hội thoại | A59, A60 | 🤖 | [ ] |
| PJ-08 | Custom agents của project (allowlist = tập mặc định) | PJ8, PJ9 | 🤖 | [ ] |
| MCP-01 | MCP proxy: forward E13–E20, `@AdminOnly` cho thêm/xoá/toggle/execute, che env/headers. Registry MCP do Engine giữ, backend không có bảng (chốt 26/11) | X1–X10 | 🤖 | [ ] |

## Đợt W3 — Tài liệu & media (10 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| STO-01 | Port `ObjectStorage` + adapter S3/MinIO (put stream, get, delete, presign) | — | 🤖 | [ ] |
| DOC-01 | Upload multipart (≤ 50 MB, đuôi hợp lệ, trùng tên theo `filename_key`) → S3 → row `documents` + event `document.uploaded` (cần BUS-01); thêm cột attempt hiện hành để rào event trạng thái cũ (rủi ro R21) | D1, D2 | 🤖 | [ ] |
| DOC-02 | Nhận event `document.processing_status_changed` (thay callback B1, cần BUS-02): fence `attemptId`, không lùi trạng thái, idempotent | ~~B1~~ | 🤖 | [ ] |
| DOC-03 | Get/list/patch/delete document (ownership qua conversation), processing-status; xoá ⇒ event `document.deleted` + xoá object S3 ngay sau commit | D3–D7 | 🤖 | [ ] |
| MED-01 | Chat image từ S3; web image proxy chống SSRF; tool result forward E10 | A47–A49 | 🤖 | [ ] |

## Đợt W4 — Lượt chat & HITL (13 route) — phần khó nhất

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| GEN-01 | Dùng khoá lượt trong lượt chat (E1/E3/E4): `PgConversationTurnLock` đã có từ CONV-03 (advisory xact lock trong DB backend, connection riêng, poll 50 ms ≤ 30 s ⇒ 409 `conversation_turn_conflict`); còn phần gắn vào orchestrator lượt chat | — | 🤖 | [ ] |
| GEN-02 | Domain `Generation` state machine + version fence + bảng `generations`, `generation_commands` | — | 🤖 | [ ] |
| GEN-03 | Gom body E1 (persona, `documents[]` = phạm vi RAG, project instructions, custom agents, hitl policy, **`modelRuntime` key đã giải mã**, `history.throughSequence`) qua port của từng module | — | 🤖 | [ ] |
| GEN-04 | `TurnOrchestrator`: lock → user message + generation (lease 30 s) → E1 → gia hạn lease 10 s → persist terminal (assistant msg, chat_images, web_image_refs, task_plans) + event `conversation.turn_persisted` → unlock; suy `plan_lifecycle` (paused/completed/executing) từ metadata sự kiện cuối như `MessageService._infer_plan_lifecycle` của Python. Client ngắt không huỷ lượt | A13, A14 | 🤖 | [ ] |
| GEN-05 | Projector **SSE nội bộ** (heartbeat 1 s) — byte-compatible với Python | A14 | 🤖 | [ ] |
| GEN-06 | Projector **AI SDK v6** (UI Message Stream v1, `: keepalive` 15 s, `[DONE]`, `finishReason:"error"`) | A27 | 🤖 | [ ] |
| GEN-07 | Stop: CAS version ⇒ `stop_requested`, `generation_commands`, E2; replay idempotent | A15 | 🤖 | [ ] |
| GEN-08 | Get generation + Continue (E4) | A16, A17, A29 | 🤖 | [ ] |
| HITL-01 | Resume: khoá → generation `running` → claim `pending→resolving` → audit `tool_approvals` → E3 | A18, A28 | 🤖 | [ ] |
| HITL-02 | Get interrupt | A46 | 🤖 | [ ] |
| TTL-01 | Generate title (E6), task plan generate (E7) | A6, A35 | 🤖 | [ ] |
| GLD-01 | Golden test stream (sync / SSE / AI SDK / Stop / Continue / HITL) — so từng byte trừ id/timestamp. Transcript ghi từ repo Python (đã có); cách ghi chốt ở ENG-01 | — | 🤖 | [ ] |

## Đợt W5 — Thiết bị & widget (14 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| RDS-01 | Redis module + key schema `client-runtime:*`, `widget:*`, `interrupt:*` (không đổi tên key) viết thành hợp đồng `src/contracts/redis/` ([integration.md §7](integration.md)) | — | 🤖 | [ ] |
| DEV-01 | Client devices register/heartbeat/list/tool-catalog/skill-catalog/connected | C1–C6, R2 | 🤖 | [ ] |
| DEV-02 | WS gateway `/ws/device-runtime/{deviceId}` (ws adapter, BLPOP connection riêng) | R1 | 🤖 | [ ] |
| HS-01 | Tool approval settings theo device | A43–A45 | 🤖 | [ ] |
| WGT-01 | Widgets connection/action + WS `/ws/widgets` (JWT widget secret riêng, đóng 1008 khi sai token) | W1r–W3r | 🤖 | [ ] |

## Đợt W6 — Vận hành (18 route)

| ID | Task | Route | Owner | Trạng thái |
|---|---|---|---|---|
| OBX-03 | Admin outbox: list + retry + phát lại theo khoảng thời gian (đối soát khi nghi mất event) | mới | 🤖 | [ ] |
| SCH-01 | Scheduler: lease reaper ⇒ event `generation.lease_expired`, interrupt expiry (mỗi phút) ⇒ `interrupt.expired`, sweep document kẹt > 1 h (chuyển từ Celery của Python về backend) | — | 🤖 | [ ] |
| USG-01 | Usage capabilities/dashboard/conversation (E11, E12); Engine chỉ trả id hội thoại ⇒ backend ghép tiêu đề, bỏ hội thoại đã xoá; `UsageDashboardV1` mới có một phần, port đủ theo `app/schemas/model_usage.py` | A50–A52 | 🤖 | [ ] |
| OPS-01 | Health dependencies đủ (Redis, S3, Engine deep), `/metrics` Prometheus (gồm streaming H15) | H9–H13, H15 | 🤖 | [ ] |

## Tách database & kênh giao tiếp (từ 2026-11-20)

Backend và Engine dùng **database riêng**; thiết kế ở [integration.md](integration.md). Thứ tự đề xuất: BUS-01 trước W3
(DOC-01 cần), BUS-02 trước DOC-02, INT-01 trước khi ghép W4 với Engine thật, ETL-01 trước cutover.

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| DS-01 | Thiết kế tách DB + kênh giao tiếp; hợp đồng sự kiện (`src/contracts/events`) và B-API (`src/contracts/backend`); outbox có kiểu theo hợp đồng; gỡ E5/E8/E9/B1 khỏi port Engine; E1/E3/E4 mang `modelRuntime`, `history`; máy canh `app.entities.spec.ts`; sửa toàn bộ tài liệu — [nhật ký 021](journal/021-tach-database.md) | 🤖 | [r] |
| BUS-01 | Event bus phía phát: port publisher + adapter Redis Streams (`XADD` + `WAITAOF`, `MINID` 7 ngày), relay outbox (poll 2 s, `FOR UPDATE SKIP LOCKED`, backoff 5 s × 2ⁿ, giãn cách ≤ 10 phút, ≤ 12 lần); mock Engine tiêu thụ event (giả lập index tài liệu) | 🤖 | [ ] |
| BUS-02 | Event bus phía nhận: consumer group `backend` trên `bus:engine:events`, bảng `inbox_events`, `XAUTOCLAIM` 60 s, DLQ sau 10 lần, metric lag | 🤖 | [ ] |
| INT-01 | B-API B2–B4 + `ServiceTokenGuard` (token Engine → backend riêng), chặn `/internal/*` ở gateway; B4 `no-store`, không log; B2 thêm tra theo tiền tố id + tiêu đề + số tin cho tool `read_past_conversation` | 🤖 | [ ] |
| ETL-01 | Script chép 22 bảng backend từ DB cũ sang DB backend (đếm dòng + checksum từng bảng), diễn tập trên bản sao | 🤖 | [ ] |
| ENG-04 | Bàn giao + theo dõi checklist phía Engine ([integration.md §11](integration.md)) — không sửa repo chatbot trong repo này | 🤖 + người làm Engine | [ ] |

## Song song suốt dự án

| ID | Task | Owner | Trạng thái |
|---|---|---|---|
| SYNC-01 | Đồng bộ schema 6 bảng của W1 với DB dựng bằng Alembic (dump `python-schema.sql`, tên FK/PK thật, default DB, CHECK, index FTS) — [nhật ký 018](journal/018-dong-bo-schema-alembic.md) | 🤖 | [r] |
| SYNC-03 | Đồng bộ artifact ↔ repo ↔ Python `80d9bc9b`: mục ◆ trong artifact, script `sync-route-mapping.mjs`, cờ rich E1/E3/E4; danh sách việc cần Hiếu quyết. 26/11: thống nhất thuật ngữ ([glossary.md](glossary.md)), kế hoạch và kiến trúc giữa artifact và repo, chốt các điểm còn lệch — [nhật ký 018 v1.4](journal/018-dong-bo-schema-alembic.md) | 🤖 | [r] |
| DEMO-01 | Script demo `pnpm demo`: dựng DB `<db>_demo`, chạy app trong tiến trình với mock Engine, 14 kịch bản HTTP thật cho mọi task đã xong; log đủ request/response/SQL/check ra màn hình và `logs/`; exit 1 khi có check sai — [nhật ký 022](journal/022-demo-script.md), [demo.md](demo.md) | 🤖 | [r] |
| ENG-01 | Đối chiếu & freeze hợp đồng V3/E1 với code Python (`events.py`, `workflow.py`, `ai_sdk_v6.py`, `internal_sse.py`) — đã có repo chatbot, làm trước W4; chốt `ModelRuntimeV1` với `ModelConfigService` và E7 (sinh task plan) có cần `modelRuntime` không | 🤖 | [ ] |
| ENG-02 | Mock Engine **dạng HTTP server** riêng (`pnpm mock:engine`) để test `HttpAiEngineClient` + timeout im lặng | 🤖 | [ ] |
| ENG-03 | Cứng hoá `HttpAiEngineClient`: retry call idempotent, circuit breaker, timeout im lặng 5 s × 3 | 🤖 | [ ] |
| LEG-01 | Lớp tương thích route cũ (envelope cũ, snake_case, sender số, header Deprecation/Sunset, counter) | 🤖 | [ ] |
| SEC-01 | Đối chiếu §9.3 lỗi bảo mật: không bypass qua đường cũ | 🤖 | [ ] |

---

## Việc cần Hiếu quyết

Chỉ gồm việc ảnh hưởng chính sách bảo mật, FE, hạ tầng hoặc phân công người. Lựa chọn kỹ thuật khác Claude tự chọn và
ghi lý do trong nhật ký (điểm tranh cãi `TC-n`, danh sách đủ ở [journal/README.md](journal/README.md#điểm-tranh-cãi)).
Chưa quyết thì Claude chạy phương án tạm và **hỏi lại khi bắt đầu task ở cột "Hạn"**.

| Việc | Đang chạy tạm | Vì sao cần Hiếu | Hạn | Chi tiết |
|---|---|---|---|---|
| Thời hạn refresh token | 30 ngày (Python 7 ngày; access 15 phút, Python 600 phút) | Bảo mật, trải nghiệm đăng nhập | Trước cutover | [005](journal/005-dang-ky-dang-nhap.md) TC-19 |
| Refresh xoay vòng nghiêm ngặt: FE và sidecar phải gọi refresh **tuần tự** | Nghiêm ngặt: dùng lại vé cũ ⇒ huỷ cả chuỗi | Ràng buộc mới với FE, Python không có | Trước cutover, cần FE đồng ý | [006](journal/006-refresh-logout.md) TC-21 |
| Logout mọi thiết bị có vô hiệu luôn access token đang sống | Không | Bảo mật | Trước cutover | [006](journal/006-refresh-logout.md) TC-22 |
| Client ngắt kết nối có huỷ lượt chat | Không huỷ (quyết định D5); Python hiện **huỷ** | FE thấy khác | Trước GEN-04 (W4) | [002](journal/002-mock-ai-engine.md) TC-9 |
| Bus sự kiện: Redis Streams hay RabbitMQ | Redis Streams, Redis bật AOF, relay dùng `WAITAOF` | Hạ tầng, chuẩn team | Trước BUS-01 | [021](journal/021-tach-database.md) TC-65 |
| Cutover **một lần** khi đủ W1–W6, hay từng đợt + đồng bộ tạm DB backend → DB cũ | Một lần | Lịch production; định hạn của ba việc về token ở trên | Càng sớm càng tốt | [021](journal/021-tach-database.md) TC-68 |
| Gửi key provider **đã giải mã** sang Engine, hay Engine giữ khoá Fernet | Đã giải mã, mạng nội bộ có TLS, không log | Bảo mật bí mật của user | Trước GEN-03 / PRV-01 | [021](journal/021-tach-database.md) TC-67 |
| Ai làm phần việc phía Engine ([integration.md](integration.md) mục 11), khi nào | — | Phân công ngoài repo này | Trước khi ghép lượt chat với Engine thật | — |

Hai chỗ kiến trúc nên xem khi review (không chặn việc): module messages đọc thẳng bảng `conversations` để kiểm sở
hữu ([012](journal/012-doc-tin-nhan.md) TC-35); module projects ghi cột `conversations.project_id`
([015](journal/015-project-va-hoi-thoai.md) TC-44).

### Đã chốt ngày 26/11 khi thống nhất tài liệu

Những điểm dưới đây trước còn treo, hoặc artifact và repo nói khác nhau. Đã chọn theo code đang chạy, hành vi Python và
phần lớn spec, rồi sửa mọi nơi cho khớp. Hiếu muốn đổi điểm nào thì ghi vào "Ghi chú review".

| Điểm | Chốt | Sửa ở đâu |
|---|---|---|
| Kiến trúc code | Clean vừa phải, mỗi miền một Nest module, như code đang chạy | Artifact mục 5 viết lại theo [architecture.md](architecture.md); [001](journal/001-nen-tang-kien-truc.md) TC-1 |
| Xoá hội thoại khi lượt đang chạy | Cho xoá; Engine tự dừng lượt khi nhận `conversation.deleted` (như Python) | Quyết định D24 trong artifact và [engine-contract.md](reference/engine-contract.md); [011](journal/011-xoa-hoi-thoai.md) TC-33 |
| Registry MCP server | Engine giữ, chuyển từ file JSON vào bảng trong DB Engine; backend chỉ chuyển tiếp API quản trị, không có bảng MCP | Artifact mục 1c.6, rủi ro R28; [integration.md](integration.md) mục 11 |
| Migration viết tay | Cho phép một ngoại lệ cho thứ TypeORM không sinh được (index full-text) | DoD ở trên; [018](journal/018-dong-bo-schema-alembic.md) TC-36 |
| GET trạng thái kế hoạch bật planning mode | Giữ như Python | [019](journal/019-doi-chieu-hanh-vi-python.md) TC-60 |
| `sort` theo trường không được phép | **Hiếu chọn:** dùng thứ tự mặc định của danh sách, không báo lỗi; Swagger ghi thứ tự mặc định và trường cho phép | Quy tắc S2 trong artifact; [022](journal/022-demo-script.md) TC-74 |
| Email đăng ký có khoảng trắng đầu/cuối | Cắt rồi kiểm, như Python | [005](journal/005-dang-ky-dang-nhap.md) TC-73 |
| Khoá ký JWT và khoá Fernet | Lấy từ env cho mọi service; backend không đọc bảng `server_secrets` | Thẻ module identity (auth + users) trong artifact, theo rủi ro R25 |
| Golden test stream | Hết bị chặn: repo Python đã có | GLD-01 |
| Tên các nhóm việc | "Nền tảng" + "đợt W1–W6" thay cho "Phase 0–6"; artifact bỏ "đợt M1–M6"; bỏ mã Q1–Q13 | [glossary.md](glossary.md) |

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
| 2026-11-25 | 🤖 | DS-01 v1.2: rà lại artifact (3 lượt độc lập: code Python, repo, nội bộ trang) ⇒ version 12: ~85 chỗ sửa (E2 chỉ còn User Stop, fork không dùng summary nguồn, C20–C22 mới, kế hoạch §10 theo cutover một lần, khoá lượt hai DB không loại trừ nhau, số route theo đợt 39/38/10/13/14/18…); repo: thu hẹp `StopTurnRequestV1.reason`, sửa comment/Swagger còn nói E5 hay "bảng dùng chung", integration.md (C20–C22, owner summary, trần backoff), thêm Q13. |
| 2026-11-25 | 🤖 | DS-01 v1.3: rà lại nhật ký 001–020 theo tách DB — gạch và sửa tại chỗ 47 đoạn ở 13 file (quy ước gạch của journal/README), cập nhật dòng TC-4; sửa comment code còn nói "schema thuộc Alembic", "Engine đọc cột"; `plan_lifecycle` paused do `MessageService` suy (ghi vào GEN-04, artifact version 13). |
| 2026-11-26 | 🤖 | DEMO-01: `pnpm demo` — 14 kịch bản, 109 bước, 258 check chạy HTTP thật trên DB `chatbot_demo` (~9 s); demo tìm ra signup chưa cắt khoảng trắng email như Python ⇒ sửa (TC-73), và `sort` lạ bị bỏ qua (TC-74, mở). Rà lại repo (agent độc lập, đối chiếu từng điểm): sửa 11 comment code lệch (OBX-02, "Engine share", migration FTS sai tên, TC-41/49 đã đóng…), how-to-add-a-module (`[~]`→`[r]`, cây thư mục FB-01), engine-contract (fork không dùng summary nguồn, D24 chưa chặn), 8 đoạn nhật ký chưa gạch, docker-compose Redis bật AOF cho `WAITAOF`; artifact version 14 (19 module, H8 `/docs`). |
| 2026-11-26 | 🤖 | Thống nhất tài liệu (SYNC-03, nhật ký 018 v1.4) theo yêu cầu Hiếu: thêm [glossary.md](glossary.md) làm nơi duy nhất định nghĩa thuật ngữ và ký hiệu (artifact chép lại); PLAN đổi "Phase" thành "đợt W1–W6", gộp hai bảng câu hỏi thành "Việc cần Hiếu quyết" (bỏ mã Q); artifact mục 5 viết lại theo kiến trúc clean của repo, bỏ "đợt M1–M6"; chốt 10 điểm còn lệch (bảng "Đã chốt ngày 26/11"). Code: `sort` lạ dùng thứ tự mặc định, Swagger ghi thứ tự mặc định từng danh sách (mô tả tham số query giờ hiện trong Swagger UI), thêm 5 test. |
