# 013 — Danh sách hội thoại kèm tin nhắn

> Task: CONV-04 (route A9, phần mở rộng) · Ngày: 2026-11-11 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Danh sách cuộc trò chuyện giờ có thêm thông tin về tin nhắn:

- mỗi cuộc trò chuyện có **số tin nhắn** (`messageCount`);
- khi cần (`include=messages`), kèm luôn **vài tin nhắn mới nhất** để hiện bản xem trước. Mặc định 3 tin,
  tối đa 20;
- ô tìm kiếm giờ tìm cả trong **nội dung tin nhắn**, không chỉ tiêu đề.

## Vấn đề cần giải quyết

Spec A9 ghi: "`include=messages` + `latestMessages` (now bounded 0..20) kept; `include=feedback` (ignored
today) rejected with 400. `search` kept (≤200)". Python mô tả `search` là "Case-insensitive conversation
title or message search".

## Đã giải quyết thế nào

- **Số tin và tin mới nhất** lấy từ module `messages` qua query công khai `ConversationMessageDigest`
  (xuất qua `public-api.ts`). Module conversations khai báo port riêng `ConversationMessages`, có adapter
  nối hai đầu, giống cách đã làm với projects.
- **Không N+1:** cả trang chỉ tốn **2 truy vấn** thêm.
  - Đếm: `GROUP BY conversation_id`.
  - Tin mới nhất: `row_number() OVER (PARTITION BY conversation_id ORDER BY sequence DESC)`.
  - `latestMessages=0` hoặc không có `include=messages` thì bỏ hẳn truy vấn thứ hai.
- **Tìm kiếm:** khớp khi tiêu đề `ILIKE` **hoặc** có tin chưa xoá mà nội dung `ILIKE`. Điều kiện viết bằng
  `EXISTS` trên bảng `messages`, đọc theo tên bảng (chỉ đọc), cùng cách như TC-35. Ký tự `%`, `_` người
  dùng gõ vào vẫn được escape.
- **`include`** nhận `include=messages` hoặc dạng lặp `include=a&include=b`. Giá trị khác `messages` (kể cả
  `feedback`) trả 400.

## Chi tiết kỹ thuật

### File chính

```text
src/modules/messages/application/message-digest.ts         query công khai (count + latest)
src/modules/messages/infrastructure/typeorm-message-digest.ts   2 truy vấn set-based
src/modules/conversations/application/ports.ts             ConversationMessages, ConversationMessageView
src/modules/conversations/application/conversation.view.ts ConversationListItemView
src/modules/conversations/application/conversation.use-cases.ts   ListConversationsUseCase + options
src/modules/conversations/infrastructure/message-digest.adapter.ts
src/modules/conversations/infrastructure/typeorm-conversation.repository.ts   QueryBuilder + EXISTS
src/modules/conversations/presentation/conversations.schemas.ts   include, latestMessages
```

### Code then chốt

```sql
-- latest N per conversation (served by ix_messages_prompt_history)
SELECT … FROM (
  SELECT m.*, row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.sequence DESC) AS rn
    FROM messages m
   WHERE m.conversation_id = ANY($1::uuid[]) AND m.deleted_at IS NULL
) latest WHERE rn <= $2
```

```ts
// search: title OR live message content
query.andWhere(`(c.title ILIKE :pattern OR EXISTS (
    SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
      AND m.content ILIKE :pattern))`, { pattern: `%${escapeLike(filter.search)}%` });
```

### Request / Response mẫu (chạy thật 2026-11-11)

```http
GET /api/v1/conversations?include=messages&latestMessages=2
```
```json
{"success":true,"code":"ok","message":"Get data successfully","data":{"items":[
  {"id":"…","title":"zz-busy", "…":"…", "messageCount":3,
   "messages":[{"sequence":3,"sender":"user","content":"third","…":"…"},
               {"sequence":2,"sender":"assistant","content":"answer about Zebra_100%","…":"…"}]},
  {"id":"…","title":"zz-quiet","…":"…","messageCount":0,"messages":[]}],
  "meta":{"page":1,"limit":20,"total":2,"totalPages":1}}}
```

Dữ liệu thử: 3 tin còn sống và 1 tin đã xoá trong `zz-busy`, 1 tin trong hội thoại của bob. Chèn bằng
SQL, chạy xong đã xoá.

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | không `include` | có `messageCount` (3 / 0; tin đã xoá không tính), không có `messages` |
| 2 | `include=messages` | 3 tin, mới nhất trước: `[3,2,1]`; hội thoại trống ⇒ `[]` |
| 3 | `latestMessages=2` | `[3,2]` |
| 4 | `latestMessages=21` | 400 |
| 5–6 | `include=feedback`, `include=messages&include=feedback` | 400 `only 'messages' can be included` |
| 7 | `search=ZEBRA` (chỉ có trong nội dung) | tìm được `zz-busy` |
| 8 | `search=_100%` | khớp đúng chuỗi, không coi là ký tự đại diện |
| 9 | `search=a_s` | 0 kết quả: `_` không khớp "answer" |
| 10 | `search=secret` (chỉ có trong tin đã xoá) | 0 kết quả |
| 11 | bob tìm `zebra` | chỉ ra hội thoại của bob |

`pnpm db:migrate:check`: không đổi schema.

### Test

Thêm 3 unit test, tổng cộng 91:

- `messageCount` có ở mọi item. `messages` chỉ có khi `include=messages`, mới nhất trước và đúng giới hạn;
  hội thoại trống ⇒ `[]`.
- `latestMessages=0` ⇒ mảng rỗng và không gọi truy vấn tin nhắn.
- `search` khớp tiêu đề **hoặc** nội dung tin.

## Giới hạn & việc còn lại

- ~~Tìm theo nội dung đang dùng `ILIKE` và chưa có index (TC-36), nên với user có rất nhiều tin sẽ chậm.
  Khi có biểu thức FTS thật sẽ đổi sang truy vấn dùng index.~~ **Sửa 26/11:** tìm theo nội dung dùng `lower(content) LIKE`
  có escape, port nguyên Python (TC-31). Index FTS `idx_messages_content_simple_fts` đã có (migration `AlembicOnlyDifferences`)
  nhưng endpoint này cố ý không dùng, vì Python cũng không dùng. User có rất nhiều tin vẫn có thể chậm.
- A8 (xem một hội thoại) chưa có `messageCount`/`messages`. Spec không yêu cầu.

## Điểm tranh cãi & quyết định

### TC-40 — `messageCount` luôn có trong danh sách
- **Bối cảnh:** Python `ConversationRead.messageCount` cho phép null. Spec không nói khi nào có. Chỉ
  `messages` được ghi là "when requested".
- **Đang chọn:** luôn trả `messageCount` trong A9, tính bằng 1 truy vấn `GROUP BY` cho cả trang.
- **Trạng thái:** tạm chọn. Cần đối chiếu Python khi có code.
- **Đối chiếu Python (2026-11-18):** Python chỉ trả `messageCount` khi `include=messages`; NestJS luôn trả (tập lớn hơn) — giữ ([019](019-doi-chieu-hanh-vi-python.md)).

### TC-41 — Thứ tự `messages` trong item: mới nhất trước
- **Bối cảnh:** "latest N" không nói thứ tự trả về.
- **Đang chọn:** `-sequence`, giống mặc định của A10. FE muốn hiện theo thời gian thì đảo mảng.
- **Trạng thái:** tạm chọn — **FE xác nhận**.
- **Đối chiếu Python (2026-11-18):** ~~mới nhất trước~~ **đã sửa (2026-11-18)** — Python chọn N tin mới nhất theo `(created_at desc, sequence desc)` rồi trả **cũ → mới**. NestJS làm giống ([019](019-doi-chieu-hanh-vi-python.md)).

### TC-31 (cập nhật) — Tìm kiếm
- Đã mở rộng sang nội dung tin nhắn bằng `ILIKE`. Chuyển sang FTS khi có TC-36.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | A9: `messageCount`, `include=messages` + `latestMessages`, tìm theo nội dung | CONV-04 |
| v1.1 | 2026-11-18 | Tin xem trước trả cũ → mới (TC-41); tìm kiếm theo độ liên quan | [019](019-doi-chieu-hanh-vi-python.md) |
| v1.2 | 2026-11-26 | Đoạn "ILIKE, chưa có index" ⇒ cách tìm hiện tại và index FTS | Rà 26/11: đoạn còn ghi là chưa làm, dù task đã xong |
