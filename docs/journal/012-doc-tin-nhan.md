# 012 — Đọc tin nhắn

> Task: MSG-01 (route A10, A19, A20) · Ngày: 2026-11-11 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Người dùng giờ **xem được tin nhắn** theo ba cách:

- danh sách tin nhắn trong một cuộc trò chuyện;
- một tin nhắn cụ thể;
- mọi tin nhắn của mình, có thể lọc theo cuộc trò chuyện.

Người gửi hiển thị bằng chữ: `user` (người dùng) hoặc `assistant` (AI), không còn là số `1`/`2` như bản Python.

Tin nhắn đã xoá, hoặc nằm trong cuộc trò chuyện đã xoá hay của người khác, đều trả "không tìm thấy".

Lượt này chỉ có phần **đọc**. Tin nhắn được **ghi** khi chat với AI, phần đó làm ở W4.

## Vấn đề cần giải quyết

- **A10** `GET /conversations/{id}/messages`: phân trang S2, mặc định `sort=-sequence`. Đây là thứ tự ổn
  định trong một hội thoại, Python mặc định theo `createdAt`.
- **A19** `GET /messages/{id}`: không sở hữu ⇒ **404** (Python trả 403; D15).
- **A20** `GET /messages`: phân trang S2, lọc tuỳ chọn theo `conversationId`.
- **S4**: cột `sender` trong DB vẫn là số khi còn dùng chung DB với Python; API trả chuỗi.
- Tạo bảng `messages` theo §6, migration **sinh bằng script**. Thêm luôn FK
  `conversations.forked_from_message_id → messages` đã hoãn từ CONV-01.

## Đã giải quyết thế nào

- **Module mới `messages`**: tách riêng như spec §5 ("chỉ đọc qua API, ghi bởi generations").
- **Quyền sở hữu:** tin nhắn thuộc về người sở hữu hội thoại. Repository join bảng `conversations` theo
  **tên bảng** (chỉ đọc), không import code của module conversations (TC-35). A20 (mọi tin nhắn của tôi)
  bắt buộc phải join như vậy.
- **`sender`:** domain giữ `'user' | 'assistant'`; chuyển từ số sang chữ ở tầng infrastructure. Gặp số lạ
  thì báo lỗi rõ ràng, không tự đoán.
- **`include=feedback`:** bảng feedbacks chưa có (FB-01). Thay vì lặng lẽ bỏ qua tham số, API trả 400
  `include is not supported yet` (TC-38).
- **Migration `AddMessages`** sinh bằng `pnpm db:migrate:generate`, đã đối chiếu với spec và chạy đủ chu
  trình kiểm tra.

## Chi tiết kỹ thuật

### File chính

```text
src/modules/messages/
  domain/message.ts                      Message (chỉ đọc), senderFromCode / senderToCode (S4)
  application/ports.ts                   MessageRepository, MESSAGE_SORTABLE
  application/message.use-cases.ts      GetMessage (A19), ListConversationMessages (A10), ListMyMessages (A20)
  application/message.view.ts           tên trường theo Python MessageRead
  infrastructure/message.record.ts      bảng messages: unique, check, 2 index (1 partial), FK
  infrastructure/typeorm-message.repository.ts   join conversations theo tên bảng
  presentation/messages.controller.ts   3 route
  messages.module.ts · public-api.ts
src/modules/conversations/infrastructure/conversation.record.ts   + FK forked_from_message_id
src/platform/database/migrations/1794360256948-AddMessages.ts     (sinh bằng script)
```

### Code then chốt

Mọi truy vấn đi qua một "bộ lọc nhìn thấy được":

```ts
private visibleTo(ownerId: string) {
  return this.db.manager.getRepository(MessageRecord).createQueryBuilder('m')
    .innerJoin('conversations', 'c',
      'c.id = m.conversation_id AND c.deleted_at IS NULL AND c.owner_id = :ownerId', { ownerId })
    .where('m.deleted_at IS NULL');
}
```

Thứ tự mặc định khác nhau theo route:

| Route | Mặc định | Lý do |
|---|---|---|
| A10 (trong 1 hội thoại) | `-sequence` | spec A10; `sequence` duy nhất và tăng dần trong hội thoại |
| A20 (mọi hội thoại) | `-createdAt` | như Python; `sequence` không so được giữa các hội thoại |

`sort` nhận `sequence`, `createdAt`, `updatedAt`, thêm `-` phía trước để đảo chiều. Luôn sắp thêm theo
`id` để phân trang ổn định.

### Migration (sinh bằng script, đã đối chiếu)

| Hạng mục | Spec §6 | Migration sinh ra |
|---|---|---|
| 9 cột (kiểu, null) | ✔ | khớp |
| `uq_messages_conversation_sequence (conversation_id, sequence)` | ✔ | ✔ |
| `ck_messages_sequence_positive` | ✔ (tên) | `sequence > 0` |
| `ix_messages_prompt_history … WHERE deleted_at IS NULL` | ✔ | ✔ |
| `idx_message_conversation_created (conversation_id, created_at)` | ✔ | ✔ |
| FK `conversation_id → conversations` | ✔ | `messages_conversation_id_fkey` |
| FK `conversations.forked_from_message_id → messages` `SET NULL` | ✔ | ✔ (hoãn từ CONV-01) |
| `idx_messages_content_simple_fts (expr)` | ✔ (chỉ tên) | **chưa**: TC-36 |

```text
$ pnpm db:migrate:check     (trước khi sinh)  -> exit 1, in đúng phần lệch ở trên
$ pnpm db:migrate:generate AddMessages        -> generated
$ pnpm db:migrate           -> executed successfully
$ pnpm db:migrate:check     -> No changes in database schema were found
$ pnpm db:migrate:revert    -> reverted; bảng messages và FK forked_from_message đã mất
$ pnpm db:migrate           -> executed successfully
$ pnpm db:migrate:check     -> No changes in database schema were found
```

Kiểm lại trong Postgres (`pg_constraint`, `pg_indexes`): đủ PK, unique, CHECK, 2 FK và 2 index đúng tên.

### Request / Response mẫu (chạy thật 2026-11-11)

Tin nhắn thử được chèn bằng SQL vì chưa có API ghi. Chạy xong đã xoá.

```http
GET /api/v1/messages/aaaaaaaa-0000-4000-8000-000000000002
```
```json
{"success":true,"code":"ok","message":"Get data successfully","data":{
  "id":"aaaaaaaa-0000-4000-8000-000000000002","conversationId":"479fed3f-…",
  "sender":"assistant","content":"hi there","messageMetadata":{"persona":"x"},"sequence":2,
  "createdAt":"2026-11-11T01:22:13.023Z","updatedAt":"2026-11-11T01:22:13.023Z","deletedAt":null}}
```

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | A10 mặc định (có 1 tin đã xoá) | 200: `#2 assistant`, `#1 user`; tin đã xoá không hiện |
| 2 | A10 `sort=sequence&limit=1&page=2` | 200: `#2`, `totalPages: 2` |
| 3 | A10, người khác xem | 404 `conversation_not_found` |
| 4 | A10 `include=feedback` | 400 `include is not supported yet` |
| 5 | A19 của mình | 200, `sender: "assistant"`, metadata nguyên vẹn |
| 6 | A19 tin của người khác | 404 `message_not_found` |
| 7 | A19 tin đã xoá | 404 |
| 8 | A20 | 200: chỉ 3 tin của mình, mới nhất trước |
| 9 | A20 `conversationId=<C2>` | 200: 1 tin |
| 10 | A20 `conversationId=nope` | 400 |
| 11–13 | sau khi **xoá hội thoại** C1: A10 / A19 / A20 | 404 / 404 / tin của C1 biến mất khỏi A20 |
| 14 | Swagger | có đủ 3 route |

### Test

Thêm 7 unit test, tổng cộng 88:

- đổi `sender` số ⇒ chữ và ngược lại; số lạ thì báo lỗi;
- A19: trả tin của mình; tin của người khác, tin đã xoá, tin trong hội thoại đã xoá đều 404;
- A10: mặc định `-sequence`, `sort=sequence` đảo chiều; hội thoại của người khác hoặc đã xoá trả 404;
- A20: chỉ tin của mình, mới nhất trước, lọc theo hội thoại.

## Giới hạn & việc còn lại

- **CONV-04** (task mới, tách khỏi lượt này cho gọn), thuộc A9:
  - `include=messages` + `latestMessages` (0..20);
  - `messageCount`;
  - tìm theo **nội dung tin nhắn** (TC-31).
- `include=feedback` ⇒ FB-01. `format=ui-message` (A26) ⇒ MSG-02, đang bị chặn vì cần code Python.
- `interrupt` trong MessageRead ⇒ W4 (HITL).
- FK `messages.conversation_id` không có `ON DELETE`. Spec không ghi, nên giữ mặc định `NO ACTION`.
  Hội thoại chỉ bị xoá mềm nên không ảnh hưởng.

## Điểm tranh cãi & quyết định

### TC-35 — Module messages join thẳng bảng `conversations`
- **Bối cảnh:** quyền sở hữu tin nhắn nằm ở `conversations.owner_id`. Luật kiến trúc: module chỉ dùng
  `public-api.ts` của nhau.
- **Phương án:**
  - (a) Join bảng theo tên trong SQL (chỉ đọc).
  - (b) Gọi port `ConversationLookup` của conversations. A10/A19 làm được, nhưng A20 cần danh sách mọi
    hội thoại của user rồi mới lọc `IN (...)`, vừa chậm vừa không phân trang đúng.
  - (c) Gộp messages vào module conversations.
- **Đang chọn:** (a). Không import code chéo nên luật máy canh vẫn xanh. Hai bảng nằm chung một DB và
  thuộc chung backend.
- **Trạng thái:** tạm chọn — **Hiếu xem** có chấp nhận join bảng chéo module (chỉ đọc) không.

### TC-36 — Chưa tạo index full-text `idx_messages_content_simple_fts`
- **Bối cảnh:**
  - Spec chỉ ghi `INDEX idx_messages_content_simple_fts (expr)`, kèm ghi chú "GIN FTS… giữ bằng raw SQL
    migration; không để TypeORM sinh lại".
  - TypeORM không sinh được index biểu thức từ entity.
  - Quy tắc hiện tại là không viết tay migration.
- **Đang chọn:** chưa tạo. Cần hai thứ: (1) biểu thức thật, lấy từ dump schema DB hoặc `models/message.py`;
  (2) Hiếu cho phép **một ngoại lệ** là migration viết tay cho đúng index này, như spec yêu cầu.
- **Ảnh hưởng:** chỉ ảnh hưởng tốc độ tìm theo nội dung (CONV-04). Lượt này không dùng tới.
- **Trạng thái:** **mở — cần Hiếu**.

### TC-37 — Trường của MessageView so với Python `MessageRead`
- **Thêm:** `sequence`. A10 sắp xếp theo trường này nên FE cần thấy nó.
- **Chưa có:**
  - `feedback` ⇒ FB-01;
  - `interrupt` ⇒ W4;
  - `suggestedQuestions`: chưa rõ Python lấy từ đâu (có thể từ `message_metadata`), nên không đoán.
- **Trạng thái:** tạm chọn.

### TC-38 — `include=feedback` trả 400 tới khi có FB-01
- **Bối cảnh:** spec giữ tham số này cho A10. Bỏ qua lặng lẽ thì FE tưởng tin nhắn không có feedback.
- **Đang chọn:** 400 với lý do rõ ràng. FB-01 sẽ bật lên.
- **Trạng thái:** tạm chọn.

### TC-39 — Phân trang theo trang (S2), không theo cursor
- **Bối cảnh:** PLAN ban đầu ghi "cursor theo `sequence`", nhưng route-mapping A10 ghi "S2" (page/limit)
  với mặc định `-sequence`.
- **Đang chọn:** S2 theo spec (luật 5). Nếu sau này cần cuộn vô hạn ổn định, sẽ thêm cursor như một tham
  số tuỳ chọn.
- **Trạng thái:** theo spec.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | Module messages: A10/A19/A20; bảng `messages` + FK `forked_from_message_id` sinh bằng script | MSG-01 |

## Gợi ý review

- TC-35: chấp nhận join bảng chéo module (chỉ đọc), hay muốn gộp messages vào conversations?
- TC-36: có thể gửi định nghĩa index FTS thật và cho phép viết tay riêng migration này không?
