# 014 — Đánh giá câu trả lời (feedback)

> Task: FB-01 (route A30, A32–A34; bỏ A31) · Ngày: 2026-11-11 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Người dùng giờ có thể **chấm điểm 1–5 sao** cho một tin nhắn, kèm nhận xét nếu muốn. Họ cũng xem lại và
sửa được điểm đã chấm. Mỗi tin nhắn chỉ có **một** đánh giá.

Bản này sửa ba lỗ hổng bảo mật của bản Python:

- trước đây ai cũng xem được đánh giá và thống kê điểm của tin nhắn bất kỳ, kể cả khi **chưa đăng nhập**;
- giờ chỉ chủ cuộc trò chuyện mới xem hoặc chấm được;
- người khác thử truy cập sẽ nhận "không tìm thấy" (404).

Danh sách tin nhắn giờ cũng kèm được đánh giá của mình (`include=feedback`).

## Vấn đề cần giải quyết

Theo spec:

| Route | Yêu cầu |
|---|---|
| A30 `POST /messages/{id}/feedback` | phải sở hữu tin nhắn; `messageId` không còn trong body; **chỉ tạo**: đã có thì 409 (Python upsert, user thứ hai chấm thì lỗi 500) |
| A31 `…/feedbacks/stats` | **bỏ** (trước đây công khai). Lớp tương thích trả lời cho chủ sở hữu |
| A32 + A33 `GET /messages/{id}/feedback` | trả một đối tượng hoặc 404 (Python trả `data: null` hoặc mảng 0–1 phần tử; A33 trước công khai) |
| A34 `PATCH /messages/{id}/feedback` | địa chỉ theo tin nhắn (1:1); `messageId` trên path **được kiểm** (Python bỏ qua) |

Bảng `feedbacks` (§6):

- unique index `ix_feedbacks_message_id`;
- `ck_feedbacks_rating_range`;
- FK tới `messages` và `users`.

## Đã giải quyết thế nào

- **Module mới `feedback`** như spec §5.
  - Kiểm quyền qua query công khai `MESSAGE_OWNERSHIP` của module messages, theo đúng luật A19 (tin chưa
    xoá, trong hội thoại còn sống của mình).
  - Module có port riêng `MessageAccess` và adapter nối sang messages.
- **409 `feedback_exists`** chặn ở hai lớp:
  - kiểm trước khi tạo, để trường hợp thường gặp có câu trả lời gọn;
  - unique index trong DB, phòng khi hai request tới cùng lúc. Repository bắt lỗi `23505` của đúng index
    này rồi đổi thành 409.
- **`include=feedback`** trên A10/A20, đóng TC-38.
  - Feedback của cả trang lấy bằng **một** truy vấn.
  - Tin chưa có đánh giá ⇒ `feedback: null`.
  - Không có `include` thì không có trường `feedback`.
  - Module messages đọc bảng `feedbacks` theo tên bảng, cùng cách TC-35, nên không import vòng
    (feedback → messages).
- Nhận xét rỗng hoặc toàn khoảng trắng được lưu là `null`.
- **Migration `AddFeedbacks`** sinh bằng script, đã chạy đủ chu trình kiểm tra.

## Chi tiết kỹ thuật

### File chính

```text
src/modules/feedback/
  domain/feedback.ts                       rating 1–5, comment rỗng ⇒ null
  application/ports.ts                     FeedbackRepository, MessageAccess
  application/feedback.use-cases.ts        Create (A30) / Get (A32, A33) / Update (A34)
  infrastructure/feedback.record.ts        unique index, check, 2 FK
  infrastructure/typeorm-feedback.repository.ts   23505 ⇒ 409 feedback_exists
  infrastructure/message-access.adapter.ts
  presentation/feedback.controller.ts      /messages/:messageId/feedback
src/modules/messages/application/message-ownership.ts   query công khai cho feedback
src/modules/messages/…                     include=feedback (feedbackFor)
src/platform/database/migrations/1794362781940-AddFeedbacks.ts   (sinh bằng script)
```

### Migration (sinh bằng script, đã đối chiếu)

| Hạng mục | Spec §6 | Migration sinh ra |
|---|---|---|
| 8 cột; `rating SMALLINT`, `comment TEXT NULL` | ✔ | khớp |
| `UNIQUE INDEX ix_feedbacks_message_id (message_id)` | ✔ | ✔ |
| `INDEX ix_feedbacks_user_id (user_id)` | ✔ | ✔ |
| `CHECK ck_feedbacks_rating_range` | ✔ (tên, "1–5") | `rating >= 1 AND rating <= 5` (TC-42) |
| FK `message_id → messages`, `user_id → users` | ✔ | ✔ |

Đã chạy lần lượt: check báo lệch → generate → migrate → check sạch → revert (bảng mất) → migrate → check
sạch.

### Request / Response mẫu (chạy thật 2026-11-11)

```http
POST /api/v1/messages/cccccccc-0000-4000-8000-000000000002/feedback
{"rating":4,"comment":"good"}
```
```json
{"success":true,"code":"ok","message":"Created successfully","data":{
  "id":"0d22201a-…","messageId":"cccccccc-…-000000000002","userId":"00000000-…-000000000001",
  "rating":4,"comment":"good","createdAt":"2026-11-11T02:08:56.679Z","updatedAt":"…","deletedAt":null}}
```

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | GET khi chưa có | 404 `feedback_not_found` |
| 2 | POST | 201 |
| 3 | POST lần hai | 409 `feedback_exists` |
| 4 | `rating: 6` | 400 |
| 5–6 | bob POST / GET tin của dev | 404 `message_not_found` |
| 7 | PATCH `rating: 5, comment: null` | 200, đã xoá nhận xét, `updatedAt` đổi |
| 8 | PATCH `rating: null` | 400 |
| 9 | PATCH `{}` | 400 `at least one field is required` |
| 10 | PATCH tin chưa có đánh giá | 404 `feedback_not_found` |
| 11 | A10 `include=feedback` | `3:null 2:5 1:null` |
| 12 | A20 `include=foo` | 400 |
| 13 | **5 lệnh POST đồng thời** trên một tin | một 201, bốn 409; DB có đúng 1 dòng |

Dữ liệu thử chèn bằng SQL, chạy xong đã xoá.

### Test

Thêm 7 unit test, tổng cộng 98:

- tạo đánh giá; nhận xét rỗng ⇒ null;
- tạo lần hai ⇒ 409 và giữ nguyên điểm cũ;
- tin không thấy được ⇒ 404 `message_not_found` ở cả 3 route;
- GET khi chưa có đánh giá ⇒ 404 `feedback_not_found`;
- PATCH đổi điểm, `comment: null` xoá nhận xét;
- rating ngoài 1..5 bị domain từ chối;
- `include=feedback` trên danh sách tin nhắn.

## Giới hạn & việc còn lại

- Chưa có route xoá feedback (spec không có). Cột `deleted_at` được giữ. Feedback đã xoá mềm vẫn chiếm
  chỗ trong unique index, nên tạo lại sẽ bị 409 (TC-43).
- `comment` không giới hạn độ dài, giống Python (TEXT). Body vẫn bị giới hạn chung của HTTP.
- A31 (thống kê điểm) do lớp tương thích LEG-01 xử lý.

## Điểm tranh cãi & quyết định

### TC-42 — Biểu thức CHECK `ck_feedbacks_rating_range`
- **Bối cảnh:** spec có tên và nghĩa ("rating 1–5", migration `371ffaf3a087`) nhưng không có câu SQL gốc.
- **Đang chọn:** `rating >= 1 AND rating <= 5`. Về nghĩa thì tương đương, chỉ khác chữ. Chạy
  `db:migrate:check` trên dump schema thật sẽ thấy ngay nếu lệch.
- **Trạng thái:** tạm chọn.

### TC-43 — Unique `message_id` không có điều kiện `deleted_at`
- **Bối cảnh:** spec ghi `UNIQUE INDEX ix_feedbacks_message_id (message_id)`, không partial.
- **Đang chọn:** giữ đúng spec. Hiện cũng không có route xoá nên chưa xảy ra.
- **Trạng thái:** theo spec.

### TC-38 (đóng) — `include=feedback`
- Đã bật ở lượt này.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | Module feedback (A30, A32–A34), bảng `feedbacks` sinh bằng script, `include=feedback` cho A10/A20 | FB-01 |
