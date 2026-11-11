# 017 — Fork (tách nhánh) hội thoại

> Task: CONV-03 (route A12a) · Ngày: 2026-11-11 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Người dùng có thể **tách nhánh** một cuộc trò chuyện tại một câu trả lời của AI. Kết quả là một cuộc trò
chuyện mới chứa bản sao mọi tin nhắn **tới và gồm** câu trả lời đó, để hỏi tiếp theo hướng khác mà không
làm rối cuộc trò chuyện gốc.

- Bấm lại (mạng chập chờn, gửi lại cùng mã yêu cầu) **không** tạo bản sao thứ hai. Hệ thống trả lại đúng
  cuộc trò chuyện đã tạo.
- Nếu AI đang trả lời trong cuộc trò chuyện gốc, việc tách nhánh sẽ **chờ** lượt đó xong (tối đa 30 giây).
- Cuộc trò chuyện quá dài (hơn 5.000 tin nhắn hoặc 32 MB) không tách được, báo lỗi 413.

## Vấn đề cần giải quyết

Theo spec A12a và sơ đồ S8:

- body `{ messageId, requestId, title? }`;
- `201` khi tạo mới, `200` khi replay cùng `requestId` + fingerprint;
- các trường hợp từ chối:

| Mã | Khi nào |
|---|---|
| 404 | message không thuộc hội thoại nguồn |
| 409 | không phải câu trả lời assistant hoàn tất · còn generation active · có tài liệu · `requestId` đã dùng cho fork khác |
| 410 | hội thoại con của `requestId` đã bị xoá |
| 413 | prefix > 5.000 message hoặc > 32 MB |

Cách làm theo S8:

- `fingerprint = sha256(sourceId, messageId, title yêu cầu)`;
- preflight kiểm `(owner_id, fork_request_id)`;
- giữ **khoá lượt của hội thoại nguồn** (≤ 30 s);
- transaction **REPEATABLE READ**: khoá project `FOR SHARE` rồi hội thoại nguồn `FOR UPDATE`; gặp `40001`
  thì chạy lại.

Python ghi `conversation_summary_jobs` (bảng Engine) trong transaction. Bản mới thay bằng outbox
`conversation.forked`.

## Đã giải quyết thế nào

- **Khoá lượt là hạ tầng dùng chung** (port `ConversationTurnLock` ở `platform/`). W4 dùng lại khi chạy lượt
  chat.
  - Dùng `pg_try_advisory_xact_lock`, poll 50 ms, tối đa 30 s, trên **một connection riêng** giữ suốt thao
    tác (giống Python). Hết giờ ⇒ 409 `conversation_busy`.
  - Key đúng công thức §11, nên khi chạy song song với Python vẫn loại trừ được nhau. Đã có test vector tính
    bằng chính công thức Python, gồm cả số dương và số âm.
- **`TransactionManager`** có thêm tuỳ chọn `retriesOnSerializationFailure`: gặp `40001` thì chạy lại
  **toàn bộ** transaction. Fork dùng 2 lần thử lại.
- **Copy tin nhắn do module messages làm** (`FORK_MESSAGE_SOURCE` xuất qua `public-api.ts`), nên
  conversations không ghi bảng `messages`.
  - Copy bằng một câu `INSERT … SELECT`, đánh số lại `1..n` bằng `row_number()`, **bỏ tin đã xoá**, giữ
    thời gian và metadata gốc.
- **Chạy đồng thời cùng `requestId`:** request thua sẽ chạm unique `uq_conversations_owner_fork_request`.
  Repository đổi lỗi đó thành `ForkRequestTakenError`, use case chạy lại preflight rồi trả về như replay
  (200).
- **Domain `Conversation.forkFrom`:** copy persona, chế độ planning và project. Đặt các cột `forked_*`, đặt
  `next_message_sequence = n + 1`, **không** copy `plan_lifecycle`.
- Thêm mã lỗi `payload_too_large` ⇒ HTTP 413 vào bảng ánh xạ lỗi chung.
- Không đổi schema. Các cột fork đã có từ CONV-01.

## Chi tiết kỹ thuật

### File chính

```text
src/platform/ports/turn-lock.port.ts                   ConversationTurnLock
src/platform/database/pg-turn-lock.ts                  advisory lock trên connection riêng + turnLockKey (§11)
src/platform/database/db-context.ts                    retry khi gặp 40001
src/modules/messages/application/message-fork.ts       ForkMessageSource (findMessage / prefixSize / copyPrefix)
src/modules/messages/infrastructure/typeorm-fork-message-source.ts
src/modules/conversations/domain/conversation.ts       forkFrom
src/modules/conversations/application/fork.use-case.ts ForkConversationUseCase
src/modules/conversations/infrastructure/fork-adapters.ts   Sha256ForkFingerprint, adapter sang messages
src/modules/conversations/infrastructure/typeorm-conversation.repository.ts   findForkRequest / insertFork
```

### Luồng (rút gọn)

```ts
const replay = await this.replay(actor, requestId, fingerprint);   // 200 / 409 / 410
if (replay) return replay;
return this.turnLock.withLock(sourceId, () =>
  this.transactions.run(() => this.forkInTransaction(...),
    { isolation: 'REPEATABLE READ', retriesOnSerializationFailure: 2 }));
// forkInTransaction: project FOR SHARE → source FOR UPDATE → message (404/409) → size (413)
//                    → insertFork → copyPrefix → outbox conversation.forked
```

### Request / Response mẫu (chạy thật 2026-11-11)

Nguồn có 5 tin: `q1`, `a1 (đã xoá)`, `a1 retry`, `q2`, `a2`.

```http
POST /api/v1/conversations/45b8adf9-…/forks
{"messageId":"dddddddd-…-000000000003","requestId":"11111111-…-00000000000a","title":"Branch A"}
```
```json
{"success":true,"code":"ok","message":"OK","data":{"id":"27e3cc42-…","title":"Branch A",
 "personaPrompt":"Be terse","forkedFromConversationId":"45b8adf9-…",
 "forkedFromMessageId":"dddddddd-…-000000000003","forkedThroughSequence":3,"…":"…"}}
```

Tin nhắn của con: `1:user:q1 | 2:assistant:a1 retry (+metadata)`. Tin đã xoá không được copy và số thứ tự
được đánh lại. `next_message_sequence = 3`, fingerprint dài 64 ký tự.

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | fork tại `a1 retry` (seq 3) | 201 |
| 2 | gửi lại y hệt | 200, cùng id |
| 3 | cùng `requestId`, khác message | 409 `request_conflict` |
| 4 | fork tại tin của user | 409 `message_not_forkable` |
| 5 | fork tại tin đã xoá | 404 `message_not_found` |
| 6 | bob fork hội thoại của dev | 404 `conversation_not_found` |
| 7 | `title: "  "` | 400 |
| 8 | xoá con rồi gửi lại | 410 `result_deleted` |
| 9 | **5 request đồng thời** cùng `requestId` | một 201, bốn 200; DB có đúng 1 con |
| 10 | outbox | có một `conversation.forked` cho mỗi con |
| 11 | **một session psql giữ khoá lượt** (cùng key) trong 3 s | fork chờ khoảng 2,7 s rồi trả 201 |
| 12 | prefix 5.002 tin | 413 `fork_too_large` `{messages: 5002, bytes: 23903}` |
| 13 | prefix đúng 5.000 tin | 201; con có 5.000 tin, seq 1..5000 |

Dữ liệu thử đã xoá sau khi chạy.

### Test

Thêm 8 unit test, tổng cộng 116:

- 5 test fork: tạo mới (lineage, copy, outbox, khoá); replay; 409/410; các trường hợp từ chối; 413 theo số
  tin và theo dung lượng;
- 3 test vector cho `turnLockKey`.

## Giới hạn & việc còn lại

- **Chưa kiểm vì bảng chưa có** (TC-56):
  - "còn generation active ⇒ 409" (W4, `generations`);
  - "có tài liệu ⇒ 409" (W3, `documents`);
  - copy `conversation_custom_agents` (W2);
  - "bỏ media owner không đọc được" (W3, `chat_images`).
- "**Hoàn tất**" hiện chỉ kiểm `sender = assistant`. Khi có `generations` cần kiểm thêm câu trả lời không
  thuộc một lượt còn đang chạy (TC-56).
- Bên Engine: nhận `conversation.forked` để tạo job tóm tắt ⇒ bộ phát outbox OBX-02 và hợp đồng phía Engine.
- `ck_conversations_fork_request_fields_together` vẫn chờ biểu thức thật (TC-29).

## Điểm tranh cãi & quyết định

### TC-53 — Cách ghép chuỗi để tính fingerprint
- **Bối cảnh:** spec chỉ ghi `sha256(sourceId, messageId, title yêu cầu)`.
- **Đang chọn:** `sha256(JSON.stringify([sourceId, messageId, title|null]))` dạng hex, id viết thường.
- **Ảnh hưởng:** chỉ khi replay một fork **do Python tạo** bằng backend mới. Khi đó fingerprint khác nhau sẽ
  cho 409 thay vì 200.
- **Trạng thái:** tạm chọn — cần code `conversation_fork_service.py` để khớp.

### TC-54 — Hội thoại con copy những gì
- **Đang chọn:**
  - copy: persona, `planningModeEnabled`, `projectId` (sơ đồ S8 ghi `project_id`);
  - không copy: `planLifecycle`;
  - tiêu đề mặc định = tiêu đề nguồn.
- **Trạng thái:** tạm chọn.

### TC-55 — Cách đo "32 MB"
- **Đang chọn:** tổng `octet_length(content) + octet_length(message_metadata::text)` của các tin chưa xoá
  trong prefix.
- **Trạng thái:** tạm chọn.

### TC-56 — Các điều kiện từ chối phụ thuộc bảng chưa có
- Xem mục "Giới hạn". Sẽ bổ sung khi W2, W3, W4 tạo bảng.

### TC-57 — Khoá lượt chờ quá 30 s ⇒ 409 `conversation_busy`
- Không rõ Python trả mã gì khi chờ khoá quá lâu. Đang chọn 409, giống `CONVERSATION_TURN_CONFLICT` của S7.

### TC-58 — Response message khi fork
- Envelope trả `message: "OK"` cho cả 201 lẫn 200, vì interceptor chỉ có một message cố định cho mỗi route.
  Phân biệt tạo mới hay replay bằng status code.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | A12a; port khoá lượt dùng chung; retry 40001; mã lỗi 413 | CONV-03 |
