# 015 — Gắn hội thoại vào project, xoá project

> Task: PJ-06 (PJ6, PJ7) + PJ-05 (PJ5) · Ngày: 2026-11-11 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

- Người dùng giờ **chuyển** được một cuộc trò chuyện vào project, sang project khác, hoặc **gỡ** nó ra khỏi
  project.
- **Xoá project** thì các cuộc trò chuyện trong đó **vẫn còn**, chỉ không thuộc project nào nữa. Đây là
  cách Python làm từ commit `cab22e26`.
- Xoá project đúng lúc đang gắn hay tạo cuộc trò chuyện vào nó cũng an toàn. Không bao giờ còn cuộc trò
  chuyện nào trỏ vào một project đã xoá.

## Vấn đề cần giải quyết

- **PJ6** `PUT /projects/{p}/conversations/{c}`: gắn; kiểm quyền sở hữu **cả hai phía**. Python mô tả là
  "Move a conversation into the project and seed the project's agents".
- **PJ7** `DELETE /projects/{p}/conversations/{c}`: gỡ. Python trả 404 khi hội thoại không thuộc project
  đó ("detach also reports wrong membership").
- **PJ5**: xoá mềm project, **gỡ mọi hội thoại** (`project_id = NULL`), ghi outbox `project.deleted`, tất
  cả trong một transaction. **Khoá project trước, hội thoại sau** (§11, S8.2).
- Hai module không được import vòng: conversations đã import projects (CONV-01).

## Đã giải quyết thế nào

- **Cột `conversations.project_id` (quan hệ thành viên) thuộc module projects** (TC-44).
  - Spec đặt PJ6/PJ7 dưới `/projects`. Python cũng xử lý trong `app/api/projects.py`.
  - Domain `Conversation` vốn coi `projectId` là chỉ đọc, và `save()` của conversations không ghi cột này.
  - Port `ConversationMembership` có 3 hàm:
    - khoá hội thoại;
    - đặt `project_id`;
    - gỡ tất cả.

    Port được cài bằng SQL trên bảng `conversations` theo tên bảng, chỉ đụng cột này.
- **Khoá theo đúng thứ tự:**

| Thao tác | Khoá project | Rồi |
|---|---|---|
| Xoá project (PJ5) | `FOR UPDATE` | `UPDATE conversations SET project_id = NULL WHERE project_id = …` |
| Gắn / gỡ (PJ6/PJ7) | `FOR SHARE` | `SELECT … FOR UPDATE` dòng hội thoại |
| Tạo hội thoại trong project (A7) | `FOR SHARE` | `INSERT` (cùng transaction, mới thêm ở lượt này) |

  `FOR SHARE` chặn lệnh xoá cho tới khi gắn/tạo xong, sau đó lệnh xoá sẽ gỡ luôn hội thoại vừa gắn. Ngược
  lại, nếu lệnh xoá chạy trước thì gắn/tạo thấy project đã xoá và trả 404. Hai thao tác gắn vào cùng một
  project không chặn nhau.
- **Gắn lại vào chính project đó** ⇒ 200, không ghi gì (idempotent). **Gắn vào project khác** ⇒ chuyển.
- Payload `project.deleted` thêm `detachedConversations` (số hội thoại đã gỡ) để tiện theo dõi.
- Không đổi schema. `pnpm db:migrate:check` báo không có thay đổi.

## Chi tiết kỹ thuật

### File chính

```text
src/modules/projects/
  application/ports/conversation-membership.ts       port: lockOwnedConversation / setProject / detachAll
  application/membership.use-cases.ts                Attach (PJ6), Detach (PJ7)
  application/project.use-cases.ts                   DeleteProject: FOR UPDATE → softDelete → detachAll → outbox
  application/project-lookup.ts                      + lockOwnedActive (FOR SHARE) cho conversations
  infrastructure/typeorm-conversation-membership.ts  SQL trên conversations.project_id
  infrastructure/typeorm-project.repository.ts       findOwnedForUpdate / findOwnedForShare
  presentation/projects.controller.ts                PUT/DELETE :projectId/conversations/:conversationId
src/modules/conversations/application/conversation.use-cases.ts   Create chạy trong transaction + khoá project
```

### Request / Response mẫu (chạy thật 2026-11-11)

```http
PUT /api/v1/projects/3d2c3ad3-…/conversations/76a09b14-…
```
```json
{"success":true,"code":"ok","message":"Updated successfully",
 "data":{"conversationId":"76a09b14-…","projectId":"3d2c3ad3-…"}}
```

Outbox sau khi xoá project có 2 hội thoại gắn vào (1 còn sống, 1 đã xoá mềm):

```json
{"ownerId":"00000000-…-000000000001","projectId":"7d0c9098-…","detachedConversations":2}
```

| # | Kịch bản | Kết quả |
|---|---|---|
| 1–2 | gắn C1 → P1, gắn lại | 200, 200 (idempotent) |
| 3 | gắn C1 → P2 | 200: đã chuyển |
| 4 | gắn vào project của bob | 404 `project_not_found` |
| 5 | gắn hội thoại của bob | 404 `conversation_not_found` |
| 6 | gỡ khỏi P1 trong khi C1 đang ở P2 | 404 `conversation_not_in_project` |
| 7–8 | gỡ khỏi P2; lọc danh sách theo P2 | 200 `projectId: null`; 0 kết quả |
| 9 | xoá P1 khi có 2 hội thoại gắn vào | 200; cả hai có `project_id = NULL`; outbox ghi `detachedConversations: 2` |
| 10–11 | tạo hội thoại / gắn vào P1 đã xoá | 404 `project_not_found` |
| 12 | **race:** cùng lúc 6 lệnh gắn + 6 lệnh tạo trong project + 1 lệnh xoá project, lặp 3 lần | lần nào project cũng bị xoá và **0** hội thoại còn trỏ vào nó |

### Test

Thêm 4 unit test, tổng cộng 102:

- xoá project gỡ mọi hội thoại và đếm đúng;
- gắn / chuyển / gắn lại;
- quyền sở hữu cả hai phía;
- gỡ sai project ⇒ `conversation_not_in_project`.

Phần chống race dựa vào khoá của Postgres, nên đã kiểm bằng chạy thật (kịch bản 12).

## Giới hạn & việc còn lại

- **Copy custom agent của project vào hội thoại khi gắn** ("seed the project's agents") ⇒ PJ-08 / W2.
  Bảng `project_custom_agents` và `conversation_custom_agents` chưa có (TC-45).
- Spec có hai câu mâu thuẫn:
  - mô tả PJ9 ghi "Agent mặc định được copy khi tạo hoặc gắn hội thoại";
  - A7 hiện chưa copy.

  Cả hai sẽ làm cùng PJ-08.

## Điểm tranh cãi & quyết định

### TC-10 (đóng) — Xoá project đang có hội thoại
- Spec PJ5 ghi rõ: "xoá project còn gỡ mọi hội thoại (`project_id = NULL`)". Đã làm theo phương án A.

### TC-44 — Module projects ghi cột `conversations.project_id`
- **Bối cảnh:** PJ5 cần gỡ hội thoại trong cùng transaction. Nếu module conversations làm việc này thì sẽ
  import vòng.
- **Phương án:**
  - (a) Projects sở hữu cột `project_id` và ghi bằng SQL theo tên bảng.
  - (b) Gỡ hội thoại không đồng bộ qua outbox. Trong lúc chờ, hội thoại vẫn trỏ vào project đã xoá, và spec
    muốn làm trong cùng transaction.
  - (c) Gộp hai module.
- **Đang chọn:** (a). Ranh giới rõ: conversations chỉ đặt `project_id` khi tạo (A7), còn lại coi là chỉ đọc.
- **Trạng thái:** tạm chọn — **Hiếu xem** (cùng loại với TC-35, nhưng đây là **ghi**).

### TC-45 — Chưa copy custom agent khi gắn
- Làm ở PJ-08 (W2).

### TC-46 — Gắn/gỡ có đổi `updated_at` của hội thoại
- **Bối cảnh:** không rõ Python có đổi không.
- **Đang chọn:** có đổi. Hội thoại vì vậy nhảy lên đầu danh sách (`-updatedAt`).
- **Trạng thái:** tạm chọn — đối chiếu khi có code Python.

### TC-47 — Response của PJ6/PJ7
- **Bối cảnh:** Python trả `ApiResponse_Any`, không rõ nội dung.
- **Đang chọn:** `{ conversationId, projectId }`.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | PJ6/PJ7; PJ5 gỡ hội thoại + khoá theo thứ tự; A7 khoá project khi tạo | PJ-06, PJ-05 |
