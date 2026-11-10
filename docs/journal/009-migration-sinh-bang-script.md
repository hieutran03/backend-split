# 009 — Migration sinh bằng script, không viết tay

> Task: F-17 · Ngày: 2026-11-10 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

*Migration* là file mô tả "thay đổi cấu trúc database" (thêm bảng, thêm cột, thêm chỉ mục…). Trước đây
file đầu tiên được **viết tay** bằng SQL — dễ lệch với code: code nói một kiểu, database một kiểu, và
không có gì báo lỗi.

Giờ quy trình đảo lại: **code là nguồn sự thật**. Mỗi bảng được mô tả đầy đủ trong code (cột, kiểu, khoá,
chỉ mục, tên ràng buộc). Một lệnh so sánh code với database và **tự sinh** file migration. Một lệnh khác
kiểm tra "code và database đã khớp chưa" — nếu lệch, nó báo lỗi.

## Vấn đề cần giải quyết

- Hiếu yêu cầu: "tạo migration bằng script và check lại cho đúng chứ đừng tự tạo".
- Tên constraint phải giống kiểu Postgres/Alembic (`users_pkey`, `projects_owner_id_fkey`, `ix_users_email`),
  không phải tên băm mặc định của TypeORM (`PK_3f2a…`, `FK_9b1c…`) — để sau này so với DB thật (dùng chung với
  Python) không bị lệch tên vô nghĩa.
- Module `projects` cần khoá ngoại tới `users` nhưng **không được import ruột** module `identity` (luật kiến trúc).

## Đã giải quyết thế nào

- Mỗi Record khai đủ: `primaryKeyConstraintName`, `@Index(<tên spec>)`, `@ForeignKey('<bảng>', { name })`, default.
  `@ForeignKey` nhận **tên bảng dạng chuỗi** ⇒ `projects` khai FK tới `users` mà không import gì của `identity`.
- Xoá file baseline viết tay; reset DB local; **sinh** migration `InitialSchema` bằng script.
- Hai lệnh mới:
  - `pnpm db:migrate:generate <Tên>` — sinh migration từ khác biệt entity ↔ DB.
  - `pnpm db:migrate:check` — báo lỗi nếu entity và DB còn lệch (dùng `migration:generate --check` của TypeORM).
- DataSource của CLI nạp migration theo glob ⇒ file sinh ra không cần đăng ký tay.
- Thư mục migrations được ESLint/Prettier bỏ qua ⇒ file giữ **đúng nguyên văn** như script sinh, nhìn là biết
  không bị sửa tay. Typecheck vẫn chạy trên nó.

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Quy ước tên + Record identity | [src/modules/identity/infrastructure/records.ts](../../src/modules/identity/infrastructure/records.ts) |
| Record projects (FK tới `users` qua tên bảng) | [project.record.ts](../../src/modules/projects/infrastructure/project.record.ts) |
| Record outbox | [outbox-event.record.ts](../../src/platform/database/outbox/outbox-event.record.ts) |
| Migration sinh ra | `src/platform/database/migrations/1794273815758-InitialSchema.ts` |
| Script sinh | [scripts/migration-generate.js](../../scripts/migration-generate.js) |
| DataSource CLI (glob) | [src/data-source.ts](../../src/data-source.ts) |

### Code then chốt

```ts
@Entity('projects')
@Index('ix_projects_owner_deleted', ['ownerId', 'deletedAt'])
export class ProjectRecord {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'projects_pkey' })
  public id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  // Referenced by table name: projects must not import the identity module's internals.
  @ForeignKey('users', { name: 'projects_owner_id_fkey' })
  public ownerId!: string;
  // ...
}
```

### Quy trình cho mọi thay đổi schema từ nay

```bash
pnpm db:migrate                       # DB local đang ở bản mới nhất
# sửa Record (thêm cột / index / FK ...)
pnpm db:migrate:generate AddSomething # sinh src/platform/database/migrations/<ts>-AddSomething.ts
# ĐỌC file sinh ra, đối chiếu docs/reference/database-schema.md
pnpm db:migrate && pnpm db:migrate:check      # phải in "No changes in database schema were found"
pnpm db:migrate:revert && pnpm db:migrate     # down chạy được, up chạy lại được
```

### Kết quả kiểm tra (chạy thật 2026-11-10)

Đối chiếu SQL sinh ra với spec §6 / §6.3:

| Bảng | Kết quả |
|---|---|
| `users` | 9 cột khớp §6 (kiểu, độ dài, null) + `role` (S1); unique `ix_users_email`, `ix_users_username` |
| `refresh_tokens` | khớp S2; unique `token_hash`; FK `user_id`, `replaced_by_id` |
| `projects` | khớp §6; `ix_projects_owner_deleted`; FK `owner_id → users` |
| `outbox_events` | khớp S3; index `(status, available_at)`; `aggregate_id` là varchar (TC-28) |

Chu trình:

```text
$ pnpm db:migrate          -> Migration InitialSchema1794273815758 has been executed successfully.
$ pnpm db:migrate:check    -> No changes in database schema were found
$ pnpm db:migrate:revert   -> reverted successfully; tables left: backend_migrations
$ pnpm db:migrate          -> executed successfully
$ pnpm db:migrate:check    -> No changes in database schema were found
```

Tên ràng buộc đọc thẳng từ catalog Postgres (`pg_constraint`, `pg_indexes`):

```text
users_pkey, refresh_tokens_pkey, projects_pkey, outbox_events_pkey
refresh_tokens_user_id_fkey, refresh_tokens_replaced_by_id_fkey, projects_owner_id_fkey
ix_users_email, ix_users_username, uq_refresh_tokens_token_hash, ix_refresh_tokens_user_id,
ix_projects_owner_deleted, ix_outbox_events_status_available
```

## ⚠️ Cần làm trên máy của bạn

Migration cũ (viết tay) đã bị thay. DB local đang chạy migration cũ sẽ không tương thích. Reset một lần:

```bash
docker compose exec postgres psql -U chatbot -c "drop schema public cascade; create schema public;"
pnpm db:migrate && pnpm db:seed
```

(Dữ liệu cũ trên máy Claude đã được `pg_dump` trước khi reset; chỉ là dữ liệu thử.)

## Giới hạn & việc còn lại

- Migration này vẫn **chỉ dành cho DB local/dev**. DB thật dùng chung với Python do Alembic sở hữu tới P3 (§6.3 S7).
  Lợi ích lớn: khi có bản dump schema DB thật, chạy `pnpm db:migrate:check` trỏ vào đó sẽ cho biết **chính xác**
  entity lệch DB thật ở đâu — thay cho đối chiếu bằng mắt.
- Tên FK kiểu `<table>_<column>_fkey` là mặc định của Postgres; nếu Alembic dùng `naming_convention` riêng thì
  tên thật có thể khác — sẽ lộ ra ngay khi chạy `check` trên DB thật.
- Chưa đưa `db:migrate:check` vào CI (cần Postgres trong CI — task F-14).

## Điểm tranh cãi & quyết định

### TC-28 — `outbox_events.aggregate_id` là `uuid` (spec) hay `varchar(255)`?
- **Bối cảnh:** Spec S3 ghi `uuid`. Nhưng event `interrupt.expired` có aggregate là id interrupt của LangGraph,
  kiểu VARCHAR(255) (§11), không phải UUID.
- **Đang chọn:** `varchar(255)` — chứa được cả UUID lẫn id interrupt.
- **Trạng thái:** tạm chọn.

### TC-29 — Có giữ CHECK `ck_conversations_fork_request_fields_together` không?
- **Bối cảnh:** Spec chỉ có **tên**, không có biểu thức. Hai CHECK còn lại (`…_positive`) rõ nghĩa từ tên nên được khai.
- **Đang chọn:** **chưa khai** — không đoán biểu thức. Cần lấy định nghĩa thật từ Alembic/DB.
- **Trạng thái:** **mở** — cần Hiếu cung cấp (cùng nguồn với TC-7).

### TC-30 — File migration sinh ra có định dạng lại không?
- **Đang chọn:** **không** — ESLint/Prettier bỏ qua thư mục migrations để file đúng nguyên văn script sinh.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-10 | Bỏ baseline viết tay; Record khai đủ schema; `db:migrate:generate`, `db:migrate:check`; migration `InitialSchema` sinh bằng script | Hiếu yêu cầu |

## Gợi ý review

- Bạn có bản dump schema DB thật (chỉ schema, không cần dữ liệu) không? Có thì tôi chạy `check` để đối chiếu.
