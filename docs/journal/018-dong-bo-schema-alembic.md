# 018 — Đồng bộ schema với DB Alembic thật

> Task: SYNC-01 · Ngày: 2026-11-18 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Backend NestJS và chatbot Python **dùng chung một database**. Tới nay bảng của NestJS được mô tả theo
tài liệu spec — mà spec chỉ chép lại *tên* vài ràng buộc, không chép *nội dung*, và thiếu giá trị mặc
định phía DB. Giờ đã có repo Python, nên tôi dựng một DB bằng chính migration Alembic của Python, so
từng cột, ràng buộc, chỉ mục với DB do NestJS tạo, rồi sửa NestJS cho khớp. Kết quả: với 6 bảng Phase 1
dùng chung, hai bên giờ giống nhau; phần khác duy nhất là những thứ NestJS **cố ý thêm** (`refresh_tokens`,
`outbox_events`, cột `users.role`).

## Vấn đề cần giải quyết

- Ba câu hỏi mở chờ "định nghĩa thật": TC-29 (CHECK fork), TC-36 (index FTS tin nhắn), TC-42 (CHECK rating).
- Tài liệu [database-schema.md](../reference/database-schema.md) khẳng định "Python không đặt DB default" —
  cần kiểm lại.
- Nhật ký 009 hẹn: khi có schema thật thì chạy `db:migrate:check` trỏ vào đó để thấy chính xác chỗ lệch.

## Đã giải quyết thế nào

1. Chạy `alembic upgrade head` của repo chatbot (head `c4f1a7b9d2e6`) vào DB rỗng `pyschema` — trong
   container `python:3.11-slim` chỉ cài `alembic`, `sqlalchemy`, `psycopg`, `pydantic-settings`
   (psycopg trên máy Windows bị Application Control chặn DLL).
2. Lưu `pg_dump --schema-only` thành [docs/reference/python-schema.sql](../reference/python-schema.sql) —
   từ nay là **nguồn chính xác** cho tên ràng buộc, biểu thức CHECK/index, default.
3. Chạy migration NestJS vào DB rỗng `nestschema`, so catalog (`information_schema.columns`, `pg_constraint`,
   `pg_indexes`, `pg_enum`) của 6 bảng `users, projects, conversations, messages, feedbacks, task_plans`.
4. Sửa Record ⇒ sinh migration bằng script; phần TypeORM không thấy được thì viết tay **một** migration nhỏ.

## Chi tiết kỹ thuật

### Lệch tìm thấy và cách sửa

| Bảng | Lệch | Sửa |
|---|---|---|
| conversations | thiếu `CHECK ck_conversations_fork_request_fields_together` | khai `(fork_request_id IS NULL) = (fork_request_fingerprint IS NULL)` |
| conversations | CHECK `…forked_through_sequence_positive` khác chữ | đổi thành `forked_through_sequence IS NULL OR forked_through_sequence > 0` (migration viết tay) |
| conversations | thiếu default `next_message_sequence 1`, `planning_mode_enabled false` | khai `default` |
| conversations | tên FK: `fk_conversations_project_id_projects`, `fk_conversations_forked_from_conversation_id`, `fk_conversations_forked_from_message_id` | đổi tên |
| messages | thiếu index `idx_messages_content_simple_fts` = `gin (to_tsvector('simple', content))` | `@Index(..., { synchronize: false })` + migration viết tay |
| messages | thiếu default `message_metadata '{}'::jsonb` | khai `default` |
| feedbacks | PK/FK tên cũ `feedback_pkey`, `feedback_message_id_fkey`, `feedback_user_id_fkey` (Alembic đổi tên bảng nhưng giữ tên ràng buộc) | đổi tên (PK: migration viết tay) |
| feedbacks | CHECK rating | **không lệch**: Python `rating BETWEEN 1 AND 5` được Postgres lưu đúng như bản NestJS `rating >= 1 AND rating <= 5` |
| projects | thiếu default `created_at/updated_at now()`; FK tên `fk_projects_owner_id_users` | khai `default`, đổi tên |
| task_plans | thiếu default `created_at/updated_at now()`, `task_metadata '{}'::jsonb`; FK tên `fk_task_plans_conversation_id` | khai `default`, đổi tên |
| users | khớp hết (NestJS thêm `role`, theo S1) | — |

### File chính

| Việc | File |
|---|---|
| Dump schema Python | [docs/reference/python-schema.sql](../reference/python-schema.sql) |
| Migration sinh bằng script | `src/platform/database/migrations/1794969244459-AlignWithAlembicSchema.ts` |
| Migration viết tay (ngoại lệ duy nhất) | `src/platform/database/migrations/1794969244460-AlembicOnlyDifferences.ts` |
| Record đã sửa | `conversation.record.ts`, `message.record.ts`, `feedback.record.ts`, `project.record.ts`, `task-plan.record.ts` |

### Vì sao cần một migration viết tay

`migration:generate` của TypeORM **không biểu diễn hoặc không phát hiện** được 3 thứ: index biểu thức
(FTS), đổi tên khoá chính, và đổi biểu thức của một CHECK đã có cùng tên (TypeORM so CHECK theo tên). Ba thứ
đó nằm trong `AlembicOnlyDifferences`, có comment giải thích; mọi thứ còn lại vẫn sinh bằng script.

### Hai chi tiết TypeORM

- Default jsonb phải khai `default: () => "'{}'"` (TypeORM đọc lại default của DB thành `'{}'`; khai
  `'{}'::jsonb` thì `check` báo lệch mãi).
- Default bigint khai `default: 1` ⇒ Postgres lưu `'1'::bigint` (Alembic: `1`). Cùng giá trị, chỉ khác chữ;
  khai dạng biểu thức `() => '1'` thì `check` lại báo lệch mãi — nên giữ `default: 1`.

### Kết quả chạy thật (2026-11-18)

```text
db:migrate          AlignWithAlembicSchema…, AlembicOnlyDifferences… executed successfully
db:migrate:check    No changes in database schema were found
db:migrate:revert ×2  reverted successfully (cả hai)
db:migrate          executed successfully
db:migrate:check    No changes in database schema were found
```

Diff catalog `pyschema` ↔ `nestschema` (6 bảng) sau khi sửa:

```text
< COL conversations.next_message_sequence ... default=1
> COL conversations.next_message_sequence ... default='1'::bigint
> COL users.role character varying(16) null=NO default='user'::character varying
< ENUM decision_type / generation_command_action / generation_status / hitl_interrupt_status /
  tool_execution_receipt_status   (bảng của W2–W4, chưa làm)
```

`DATABASE_URL=<pyschema> pnpm db:migrate:check` (entity NestJS so với DB Alembic) chỉ đề xuất đúng phần NestJS thêm:
`CREATE TABLE outbox_events`, `CREATE TABLE refresh_tokens` (+ index, FK), `ALTER TABLE users ADD role`. Đây chính
là nội dung migration "P-cutover" cho DB thật.

`pnpm verify`: 19 suite, 116 test xanh; dependency-cruiser không vi phạm.

## Cách thử

```bash
# Dựng schema Python (cần Docker; repo chatbot cạnh repo này)
docker exec backend-split-postgres-1 psql -U chatbot -c "CREATE DATABASE pyschema"
# chạy alembic upgrade head trong container python:3.11-slim (xem mục "Đã giải quyết thế nào")
DATABASE_URL=postgres://chatbot:chatbot@localhost:5432/pyschema pnpm db:migrate:check
```

## Đồng bộ với artifact và Python mới (v1.1, 2026-11-18)

- **Repo Python sau mốc artifact** (`4bf74a95` → `80d9bc9b`, 41 commit): không có migration; 2 thay đổi API:
  cờ `answerVisualsV1`/`sourceFiguresV1` (A26 và body Chat/Resume/Continue, truyền vào `WorkflowExecutionRequest`),
  và WS thiết bị đóng mã 1012 khi heartbeat trên phiên runtime đã hết hạn.
- **Artifact** (version 9, cùng link): thêm mục ◆ "Đối chiếu 18/11" (DB thật, Python mới, hành vi đã rõ); sửa 4 dòng
  §11 đã sai/thiếu (default DB, CHECK rating, fingerprint, index FTS); ghi chú route A17, A18, A26, A27a, A28, A29, R1.
  Nội dung cũ giữ nguyên, phần thêm có nhãn ngày.
- **Bảng route trong repo** giờ sinh bằng `node scripts/reference/sync-route-mapping.mjs <artifact.html> <commit>`.
  Kiểm script trên bản artifact cũ: tái tạo đúng bản trích ngày 09/11, chỉ khác là escape `|` trong ô bảng
  (bản cũ không escape nên dòng A15, A18, H13 bị vỡ cột khi hiển thị).
- **Hợp đồng Engine** (DRAFT): thêm `RichCapabilitiesV1` cho E3/E4 và 2 cờ mới cho E1 (`src/contracts/engine/internal-api.ts`,
  `docs/reference/engine-contract.md`). Bản DRAFT trước thiếu cả `inlineRichResponseV1` ở E3/E4.

## Giới hạn & việc còn lại

- Mới so 6 bảng Phase 1. Bảng W2–W6 sẽ so khi làm task tương ứng — dump đã có sẵn.
- Dump chụp ở head `c4f1a7b9d2e6`; repo Python có migration mới thì dump lại.
- `users.role` vẫn là cột NestJS thêm (S1) — khi cutover cần chạy trên DB thật.

## Điểm tranh cãi & quyết định

### TC-29 — CHECK `ck_conversations_fork_request_fields_together`
- **Trạng thái:** **đóng** — biểu thức thật `(fork_request_id IS NULL) = (fork_request_fingerprint IS NULL)` đã khai.

### TC-36 — Index FTS tin nhắn + một migration viết tay
- **Bối cảnh:** Biểu thức thật `gin (to_tsvector('simple', content))`. TypeORM không sinh được index biểu thức.
- **Đang chọn:** record khai `synchronize: false`; một migration viết tay `AlembicOnlyDifferences` gom cả 3 thứ
  TypeORM không thấy (FTS, tên PK feedbacks, chữ của CHECK forked_through).
- **Trạng thái:** **đóng phần biểu thức**; việc cho phép 1 migration viết tay — **chờ Hiếu duyệt**.
- **Nếu đổi ý:** bỏ index khỏi NestJS (DB thật vẫn có do Alembic tạo), giữ `synchronize: false` để `check` không đòi xoá.

### TC-42 — CHECK rating
- **Trạng thái:** **đóng** — Python `BETWEEN 1 AND 5`, Postgres lưu giống hệt bản NestJS.

### TC-59 — Tên ràng buộc theo DB thật thay vì quy ước `<table>_<column>_fkey`
- **Bối cảnh:** Quy ước ở `identity/infrastructure/records.ts` đoán tên theo mặc định Postgres; DB thật có các
  tên `fk_*` (Alembic naming) và `feedback_*` (tên trước khi đổi tên bảng).
- **Đang chọn:** theo **tên thật trong dump**, kể cả tên "xấu" `feedback_pkey` — để cutover không phải đổi tên gì.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-18 | Dump schema Alembic; sửa 5 Record; migration `AlignWithAlembicSchema` (sinh) + `AlembicOnlyDifferences` (viết tay); cập nhật database-schema.md | Có repo Python để đối chiếu |
| v1.1 | 2026-11-18 | Đồng bộ artifact (mục ◆, §11, 7 route) với code Python `80d9bc9b`; script sinh route-mapping; cờ rich trong hợp đồng E1/E3/E4 | Hiếu yêu cầu đồng bộ 3 nguồn |

## Gợi ý review

- Duyệt ngoại lệ "một migration viết tay" (TC-36).
- Mở `python-schema.sql` đối chiếu phần còn lại của database-schema.md khi làm W2+.
