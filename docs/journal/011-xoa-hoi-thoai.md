# 011 — Xoá hội thoại

> Task: CONV-02 (route A12; gộp A25) · Ngày: 2026-11-11 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Người dùng giờ có thể **xoá một cuộc trò chuyện**. Sau khi xoá:

- nó biến khỏi danh sách và không mở lại được (báo "không tìm thấy");
- dữ liệu chưa bị xoá hẳn khỏi DB, chỉ được đánh dấu "đã xoá" (xoá mềm);
- phần dữ liệu AI Engine giữ cho cuộc trò chuyện đó (checkpoint của các lượt chat) sẽ được dọn **chắc chắn**.
  Backend ghi một "việc cần làm" vào hàng đợi (outbox), và bộ phát sẽ gọi Engine, có thử lại khi lỗi.
  Python hiện chỉ dọn "cố gắng hết sức" trong cùng request, lỗi là bỏ qua.

Các cuộc trò chuyện được **fork** từ cuộc này vẫn giữ nguyên.

## Vấn đề cần giải quyết

- A12: xoá mềm + outbox `conversation.deleted`. Payload phải có đủ `threadIds`, theo bảng outbox trong
  [engine-contract.md](../reference/engine-contract.md):
  `generations.checkpoint_thread_id ∪ hitl_interrupts.thread_id`.
- Xoá mềm và ghi outbox phải nằm trong **một transaction** (D9). Không được xảy ra trường hợp đã xoá mà
  thiếu event, hoặc có event mà chưa xoá.
- Hai lệnh xoá cùng lúc không được ghi **hai** event.
- Của người khác hoặc đã xoá ⇒ 404 (D15).

## Đã giải quyết thế nào

- Domain: thêm `Conversation.softDelete(now)`, đặt `deleted_at = updated_at = now`.
- Use case `DeleteConversationUseCase` làm mọi việc trong một transaction:
  1. **khoá dòng** (`SELECT … FOR UPDATE`, chỉ lấy dòng của mình, chưa xoá);
  2. xoá mềm;
  3. lấy danh sách thread;
  4. ghi outbox.

  Lệnh xoá thứ hai chạy cùng lúc phải chờ khoá. Khi được chạy, nó thấy dòng đã xoá nên trả 404 và không
  ghi event nào.
- `threadIds` lấy qua port `ConversationThreadSource` của module conversations.
  - Hai bảng `generations` và `hitl_interrupts` (backend sở hữu) tới W4 mới có. GEN-02 tạo `generations`.
  - Tạm thời adapter `NoThreadSourceYet` trả `[]`. Điều này đúng với dữ liệu hiện tại: chưa có lượt chat
    nào chạy, nên cũng chưa có thread nào.
  - Khi hai bảng có, chỉ cần thay adapter; use case và payload giữ nguyên.
- Không đổi schema nên **không có migration**. `pnpm db:migrate:check` báo "No changes in database schema
  were found".

## Chi tiết kỹ thuật

### File chính

```text
src/modules/conversations/
  domain/conversation.ts                        softDelete(now)
  application/ports.ts                          findOwnedForUpdate, ConversationThreadSource
  application/conversation.use-cases.ts         DeleteConversationUseCase, ConversationDeletedPayload
  infrastructure/typeorm-conversation.repository.ts   lock: pessimistic_write
  infrastructure/no-thread-source.ts            tạm trả [] tới khi có generations/hitl_interrupts
  presentation/conversations.controller.ts      DELETE /conversations/:conversationId
```

### Code then chốt

```ts
await this.transactions.run(async () => {
  const conversation = await this.conversations.findOwnedForUpdate(conversationId, actor.userId);
  if (!conversation) throw new NotFoundError('conversation');
  conversation.softDelete(this.clock.now());
  await this.conversations.save(conversation);
  await this.outbox.enqueue({
    eventType: 'conversation.deleted',
    aggregateType: 'conversation',
    aggregateId: conversation.id,
    payload: { conversationId, ownerId, threadIds: await this.threads.threadIdsOf(conversation.id) },
  });
});
```

### Request / Response mẫu (chạy thật 2026-11-11)

```http
DELETE /api/v1/conversations/8d616664-f43e-4e85-8282-90bd383347b5
Authorization: Bearer <token>
```
```json
{"success":true,"code":"ok","message":"Deleted successfully","data":null}
```

Dòng trong `outbox_events`:

```text
conversation.deleted | conversation | {"ownerId": "00000000-…-000000000001", "threadIds": [], "conversationId": "8d616664-…"} | pending
```

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | người khác xoá | 404 `conversation_not_found`, dòng không đổi |
| 2 | chủ xoá | 200 `data: null`; `deleted_at` có giá trị, `updated_at = deleted_at` |
| 3 | xoá lại | 404 |
| 4 | xem sau khi xoá | 404 |
| 5 | id sai định dạng | 400 |
| 6 | không có token | 401 `missing_token` |
| 7 | **5 lệnh xoá cùng lúc**, lặp 3 lần | mỗi lần: một 200 và bốn 404, **đúng 1 event** |

### Test

Thêm 2 unit test, tổng cộng 81:

- Xoá mềm và ghi outbox trong 1 transaction, payload có đủ `threadIds`. Sau khi xoá, xem trả 404 và danh
  sách rỗng.
- Người khác xoá ⇒ 404, dữ liệu không đổi. Xoá lần hai ⇒ 404. Chỉ có 1 event.

Phần chống ghi hai event khi xoá đồng thời phụ thuộc khoá của Postgres, nên không unit test được. Phần này
đã kiểm bằng chạy thật (kịch bản 7).

## Giới hạn & việc còn lại

- **Bộ phát outbox (OBX-02)** chưa có. Event đang nằm ở `pending`. Khi làm OBX-02, với
  `conversation.deleted` bộ phát sẽ:
  1. gọi E2 dừng lượt đang chạy, nếu có;
  2. gọi E5 với `threadIds`.
- `threadIds` thật: thay `NoThreadSourceYet` bằng truy vấn khi có bảng `generations` (GEN-02) và
  `hitl_interrupts`.
- Khi đã có lượt chat (W4), xoá có cần lấy **khoá lượt** (advisory lock) của hội thoại không? Xem lại cùng
  TC-33.
- Spec ghi về hành vi Python hiện tại (S8.3): Python chỉ xoá thread id kiểu cũ, còn thread `routing-v2:*`
  do retention sweep dọn. Backend mới gửi mọi thread lấy từ hai bảng trên, không lọc theo tiền tố.

## Điểm tranh cãi & quyết định

### TC-33 — Đang có lượt chat thì xoá được không?
- **Bối cảnh:** spec mâu thuẫn.
  - [engine-contract.md](../reference/engine-contract.md) mục D24 ghi: "Xoá hội thoại đang có lượt active
    ⇒ 409". PLAN ban đầu cũng chép theo D24.
  - Ghi chú route A12 trong [route-mapping.md](../reference/route-mapping.md) ghi ngược lại: "An active
    turn does not block the delete: it is stopped through E2 and the delete proceeds".
  - Bảng outbox ghi `conversation.deleted` ⇒ "E2 (nếu còn lượt active) rồi E5".
- **Phương án:**
  - (a) Không chặn: xoá luôn, bộ phát dừng lượt qua E2.
  - (b) Trả 409 như D24, người dùng phải bấm Stop trước.
- **Đang chọn:** (a). Hai nguồn cụ thể hơn (ghi chú route và bảng outbox) khớp nhau. Theo AGENTS luật 5,
  route-mapping là nguồn sự thật cho route.
- **Ảnh hưởng hiện tại:** không có. Bảng `generations` chưa tồn tại nên chưa thể có lượt active.
- **Trạng thái:** tạm chọn, **chờ Hiếu xác nhận** trước W4.

### TC-34 — `threadIds` lấy lúc xoá hay lúc phát?
- **Bối cảnh:** có thể chụp danh sách thread ngay trong transaction xoá, hoặc để bộ phát tự truy vấn khi
  gọi E5.
- **Đang chọn:** chụp lúc xoá, ghi luôn vào payload. Payload tự đủ thông tin: bộ phát (ở `platform`) không
  phải đọc bảng của module, và kết quả không phụ thuộc thời điểm phát.
- **Rủi ro:** nếu sau khi xoá vẫn sinh thêm thread thì thread đó bị sót. Lượt đang chạy có thể ghi tiếp
  checkpoint trước khi E2 kịp dừng nó. Khi tới W4 cần cân nhắc: hoặc bộ phát gọi E2 trước rồi truy vấn bổ
  sung, hoặc trông vào retention sweep của Engine.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | A12/A25: xoá mềm + outbox `conversation.deleted`, khoá dòng chống xoá trùng | CONV-02 |

## Gợi ý review

- TC-33: chốt (a) hay (b)? FE hiện có cho xoá khi đang stream không?
- Xoá trả `200` với `data: null`, giống xoá project. Python trả gì? Tôi chưa đối chiếu được code Python.
