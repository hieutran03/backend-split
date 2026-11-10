# 010 — Hội thoại: tạo, xem, sửa, danh sách

> Task: CONV-01 (route A7, A8, A9, A11; gộp A21–A24) · Ngày: 2026-11-10 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Người dùng giờ có thể **tạo cuộc trò chuyện**, xem danh sách (có phân trang, lọc theo project, tìm theo
tiêu đề), xem chi tiết và **sửa** (đổi tên, đặt/xoá "persona" — chỉ dẫn riêng cho AI trong cuộc trò chuyện
đó, bật/tắt chế độ lập kế hoạch).

Một cuộc trò chuyện có thể nằm trong một **project** của chính người dùng. Gắn vào project của người khác
⇒ báo "không tìm thấy", không tiết lộ project đó có tồn tại.

Đây là nền cho phần chat ở các đợt sau: tin nhắn, tài liệu, lượt chat AI đều gắn vào một cuộc trò chuyện.

## Vấn đề cần giải quyết

- Spec A7–A11 + gộp các route trùng `/ai/conversations*` (A21–A24) về một bộ `/api/v1/conversations`.
- A8: bỏ trường `customAgents` (Python chưa bao giờ điền).
- A11: `personaPrompt: null` để **xoá** persona; `title: null` bị **từ chối**.
- A9: phân trang chuẩn S2, `search` ≤ 200 ký tự.
- Kiểm `projectId` thuộc về module **projects** — `conversations` không được đọc thẳng bảng của module khác.
- Bảng `conversations` theo §6 — migration **sinh bằng script** (quy trình 009).

## Đã giải quyết thế nào

- Context mới `conversations` (4 tầng như mẫu `projects`).
- **Giao tiếp giữa hai module qua port:** `projects` công khai một hàm tra cứu `ProjectLookup` qua
  `public-api.ts`; `conversations` khai báo nhu cầu của mình (`ProjectAccess`) và một adapter nối hai đầu.
  Đây là cách mọi module sau dùng dữ liệu của nhau.
- Tìm kiếm tiêu đề không phân biệt hoa/thường; ký tự `%`, `_` người dùng gõ vào được **escape**, không thành
  ký tự đại diện SQL.
- `next_message_sequence = 1`, `planning_mode_enabled` do app gán (Python cũng không đặt default ở DB).

## Chi tiết kỹ thuật

### File chính

```text
src/modules/conversations/
  domain/conversation.ts                  title 1–255 (trim), persona ≤ 8000 (rỗng ⇒ null)
  application/ports.ts                    ConversationRepository, ProjectAccess (port của conversations)
  application/conversation.use-cases.ts   Create / List / Get / Update
  application/conversation.view.ts        tên trường theo Python ConversationRead
  infrastructure/conversation.record.ts   bảng đầy đủ: FK, unique, check, 5 index (1 partial)
  infrastructure/typeorm-conversation.repository.ts
  infrastructure/project-access.adapter.ts   ProjectAccess ⇒ ProjectLookup của projects
  presentation/conversations.controller.ts
  conversations.module.ts                 imports: [ProjectsModule]
src/modules/projects/application/project-lookup.ts   truy vấn công khai cho module khác
src/platform/database/migrations/1794274110725-AddConversations.ts   (sinh bằng script)
```

### Code then chốt

Hai module nói chuyện qua port, không chia sẻ repository:

```ts
// projects công khai (public-api.ts)
export interface ProjectLookup { isOwnedActive(projectId: string, ownerId: string): Promise<boolean> }

// conversations: nhu cầu của mình, bằng ngôn ngữ của mình
export interface ProjectAccess { ownsActiveProject(ownerId: string, projectId: string): Promise<boolean> }

// adapter nối hai đầu (conversations/infrastructure)
export class ProjectLookupAccessAdapter implements ProjectAccess {
  public ownsActiveProject(ownerId, projectId) { return this.projects.isOwnedActive(projectId, ownerId); }
}
```

Bảng khai trong Record ⇒ migration sinh ra (rút gọn):

```ts
@Index('ix_conversations_project_updated', ['projectId', 'updatedAt'], { where: 'deleted_at IS NULL' })
@Unique('uq_conversations_owner_fork_request', ['ownerId', 'forkRequestId'])
@Check('ck_conversations_next_message_sequence_positive', 'next_message_sequence > 0')
export class ConversationRecord { /* … */
  @ForeignKey('conversations', { name: 'conversations_forked_from_conversation_id_fkey', onDelete: 'SET NULL' })
  public forkedFromConversationId!: string | null;
}
```

### Migration (sinh bằng script, đã đối chiếu)

| Hạng mục | Spec §6 | Migration sinh ra |
|---|---|---|
| 16 cột (kiểu, độ dài, null) | | khớp |
| `uq_conversations_owner_fork_request` | ✔ | ✔ |
| 2 CHECK `…_positive` | ✔ (tên) | `> 0` |
| 5 index, `ix_conversations_project_updated … WHERE deleted_at IS NULL` | ✔ | ✔ |
| FK owner → users, project → projects, forked_from_conversation → conversations `SET NULL` | ✔ | ✔ |
| FK forked_from_message → messages `SET NULL` | ✔ | **chưa** — bảng messages có ở MSG-01, sẽ sinh khi đó |
| CHECK `ck_conversations_fork_request_fields_together` | ✔ (tên) | **chưa** — TC-29 |

```text
$ pnpm db:migrate:check     (trước khi sinh)  -> exit 1   ✔ phát hiện entity mới chưa có trong DB
$ pnpm db:migrate:generate AddConversations   -> generated
$ pnpm db:migrate           -> executed successfully
$ pnpm db:migrate:check     -> No changes in database schema were found
$ pnpm db:migrate:revert    -> reverted; còn lại: backend_migrations, outbox_events, projects, refresh_tokens, users
$ pnpm db:migrate           -> executed successfully
$ pnpm db:migrate:check     -> No changes in database schema were found
```

### Request / Response mẫu (chạy thật 2026-11-10)

```http
POST /api/v1/conversations
{"title":"  Budget review  ","personaPrompt":"You are a CFO"}
```
```json
{"success":true,"code":"ok","message":"Created successfully","data":{
  "id":"0d890db2-…","ownerId":"00000000-0000-4000-8000-000000000001","title":"Budget review",
  "personaPrompt":"You are a CFO","planningModeEnabled":false,"planLifecycle":null,"projectId":null,
  "forkedFromConversationId":null,"forkedFromMessageId":null,"forkedThroughSequence":null,
  "createdAt":"…","updatedAt":"…","deletedAt":null}}
```

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | tạo (tiêu đề có khoảng trắng thừa) | 201, tiêu đề đã trim |
| 2 | tạo trong project của mình | 201 |
| 3 | tạo trong project của **người khác** | 404 `project_not_found` |
| 4 | `title: ""`, `projectId` sai định dạng | 400, báo cả 2 field |
| 5–6 | xem của mình / người khác xem | 200 / 404 `conversation_not_found` |
| 7 | sửa `personaPrompt: null` + đổi tên | 200, persona đã xoá |
| 8 | sửa `title: null` | 400 |
| 9 | sửa body rỗng | 400 `at least one field is required` |
| 10–11 | danh sách / lọc `projectId` | 200 |
| 12 | `search=budg%` | 0 kết quả — `%` không thành ký tự đại diện |
| 13 | `search=BUDGET` | tìm được "Budget review" (không phân biệt hoa/thường) |
| 14 | người khác xem danh sách | 0 kết quả |

Trong DB: `next_message_sequence = 1`, `planning_mode_enabled` có giá trị dù DB không đặt default.

### Test

7 test mới (tổng 79): tạo với giá trị mặc định; `projectId` của người khác ⇒ 404 và không ghi gì; persona
rỗng ⇒ null; người khác xem/sửa ⇒ 404; `personaPrompt: null` xoá persona, trường khác giữ nguyên; tiêu đề
toàn khoảng trắng ⇒ 400; danh sách chỉ của mình, lọc project, tìm tiêu đề.

## Giới hạn & việc còn lại

- `include=messages`, `latestMessages`, `messageCount`, tìm trong **nội dung tin nhắn** ⇒ MSG-01 (cần bảng messages).
- Xoá hội thoại (A12) ⇒ CONV-02 (xoá mềm + outbox; spec: lượt chat đang chạy **không** chặn xoá mà bị dừng qua E2).
- Chuyển hội thoại giữa các project ⇒ PJ-06.
- Sửa hội thoại cũng nên **khoá** để không đè lên thao tác khác cùng lúc (lost update) — chưa cần khi chưa có
  lượt chat ghi vào bảng; sẽ xem lại ở W4.

## Điểm tranh cãi & quyết định

### TC-31 — Tìm kiếm chỉ trên tiêu đề (tạm thời)
- **Bối cảnh:** Python tìm "title or message". Bảng messages chưa có.
- **Đang chọn:** chỉ tiêu đề ở lượt này; mở rộng sang nội dung tin nhắn (dùng index FTS `idx_messages_content_simple_fts`) ở MSG-01.
- **Trạng thái:** tạm chọn.

### TC-32 — `planningModeEnabled: null` khi sửa
- **Bối cảnh:** Python `ConversationUpdate` cho phép `null` (nghĩa: không đổi). Spec mới chỉ nói về `title` và `personaPrompt`.
- **Đang chọn:** chỉ nhận `true`/`false`; bỏ trường nếu không muốn đổi. Gửi `null` ⇒ 400.
- **Trạng thái:** tạm chọn — lớp tương thích (LEG-01) sẽ chuyển `null` cũ thành "không đổi".

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-10 | A7/A8/A9/A11, migration `AddConversations` sinh bằng script, ProjectLookup công khai | CONV-01 |

## Gợi ý review

- TC-32: FE hiện có gửi `planningModeEnabled: null` không?
- Thứ tự mặc định danh sách: `-updatedAt` (mới cập nhật lên đầu) — giống Python. OK?
