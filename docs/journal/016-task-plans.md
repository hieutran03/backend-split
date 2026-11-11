# 016 — Kế hoạch công việc (task plans)

> Task: TP-01 (route A36–A42) · Ngày: 2026-11-11 · Trạng thái: chờ review · Phần còn thiếu: TP-02 bị chặn

## Tóm tắt dễ hiểu

Mỗi cuộc trò chuyện có thể có một **danh sách việc cần làm** (kế hoạch). Người dùng giờ có thể:

- thêm việc (luôn nối vào cuối danh sách);
- xem danh sách. Mặc định ẩn việc đã xong hoặc đã bỏ qua;
- xem, sửa, đánh dấu xong, xoá từng việc;
- xem **tiến độ**: bao nhiêu việc đang chờ / đang làm / đã xong / bỏ qua, phần trăm hoàn thành, và việc
  nên làm tiếp theo.

**Chưa làm:** Python tự cập nhật "trạng thái kế hoạch" của cuộc trò chuyện (nháp / sẵn sàng / đang chạy /
tạm dừng / xong) sau mỗi thay đổi. Spec không có quy tắc này, mà AI Engine lại đọc trạng thái đó. Ghi sai
sẽ ảnh hưởng tới AI, nên tôi **không tự đoán**. Việc này tách thành TP-02, chờ code Python.

## Vấn đề cần giải quyết

| Route | Spec |
|---|---|
| A36 `POST /conversations/{id}/task-plans` | tạo thủ công (thay `…/manual`); mô tả rỗng ⇒ 400 (Python 500); Python: "new tasks are appended after the current last task" |
| A37 `GET /conversations/{id}/task-plans?includeCompleted=` | đổi tên query (S3); Python mặc định `false`: ẩn completed và skipped |
| A38 `GET /task-plans/{id}` | — |
| A39 `PATCH /task-plans/{id}` | `completedAt` **không** cho client đặt nữa, suy ra từ `status` |
| A40 `POST /task-plans/{id}/complete` | — |
| A41 `DELETE /task-plans/{id}` | vẫn xoá cứng |
| A42 `GET /conversations/{id}/planning-status` | số đếm, phần trăm, việc tiếp theo |

Bảng `task_plans` (§6):

- `status` là enum Postgres `task_status`;
- `UNIQUE uq_task_plan_conversation_order (conversation_id, task_order) DEFERRABLE`. §5 ghi rõ thêm
  `INITIALLY DEFERRED` để đổi thứ tự task.

## Đã giải quyết thế nào

- **Module mới `task-plans`** như spec §5. Quyền sở hữu đi theo hội thoại: đọc bảng `conversations` theo tên
  bảng (chỉ đọc, TC-35). Hội thoại bị xoá thì task cũng ẩn theo.
- **Thêm việc an toàn khi chạy đồng thời:** khoá dòng hội thoại (`FOR UPDATE`), lấy `max(task_order)`, rồi
  thêm các việc mới với thứ tự `max+1, max+2…`.
- **`completedAt` theo `status`:**
  - chuyển sang `completed` ⇒ đặt thời điểm hiện tại;
  - đã completed mà đánh dấu lại ⇒ giữ thời điểm cũ;
  - rời khỏi `completed` ⇒ `null`.

  Body PATCH có `completedAt` ⇒ 400 (`strict`).
- **Planning status:** số đếm theo trạng thái là chắc chắn. Cách tính `progressPercentage` và chọn
  `nextTask` là **tạm** (TC-49). Đây chỉ là phép tính khi đọc, không ghi gì vào DB.
- **`plan_lifecycle`:** chỉ đọc và trả về giá trị đang có. **Không** ghi (TC-48, TP-02).
- **Migration `AddTaskPlans`** sinh bằng script: enum `task_status`, unique DEFERRABLE INITIALLY DEFERRED,
  FK sang `conversations`.

## Chi tiết kỹ thuật

### File chính

```text
src/modules/task-plans/
  domain/task-plan.ts               TaskPlan: add / update / complete, completedAt theo status
  domain/planning-status.ts         planProgress() — số đếm, % (tạm), nextTask (tạm)
  application/ports.ts              TaskPlanRepository (+ đọc/khoá conversation theo tên bảng)
  application/task-plan.use-cases.ts   7 use case A36–A42
  infrastructure/task-plan.record.ts   enum task_status, unique deferrable
  infrastructure/typeorm-task-plan.repository.ts
  presentation/task-plans.controller.ts · task-plans.schemas.ts
src/platform/database/migrations/1794363557801-AddTaskPlans.ts   (sinh bằng script)
```

### Migration (sinh bằng script, đã đối chiếu)

```sql
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped');
CREATE TABLE "task_plans" (…, CONSTRAINT "uq_task_plan_conversation_order"
  UNIQUE ("conversation_id", "task_order") DEFERRABLE INITIALLY DEFERRED, …);
ALTER TABLE "task_plans" ADD CONSTRAINT "task_plans_conversation_id_fkey" FOREIGN KEY …;
```

Đã chạy lần lượt: check báo lệch → generate → migrate → check sạch → revert (bảng và enum đều mất) →
migrate → check sạch. `pg_constraint` xác nhận `condeferrable = t`, `condeferred = t`.

### Request / Response mẫu (chạy thật 2026-11-11)

```http
POST /api/v1/conversations/1c747885-…/task-plans
{"taskDescriptions":["  Draft outline ","Write"]}
```
```json
{"success":true,"code":"ok","message":"Created successfully","data":[
  {"id":"11a23627-…","conversationId":"1c747885-…","taskOrder":1,"description":"Draft outline",
   "status":"pending","taskMetadata":null,"createdAt":"…","updatedAt":"…","completedAt":null},
  {"…":"…","taskOrder":2,"description":"Write","status":"pending"}]}
```

```json
GET /conversations/{id}/planning-status
{"planningModeEnabled":false,"planLifecycle":null,"totalTasks":2,"pendingTasks":0,"inProgressTasks":1,
 "completedTasks":1,"skippedTasks":0,"progressPercentage":50,"nextTask":{"description":"Write","…":"…"}}
```

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | thêm 2 việc | 201: thứ tự 1, 2; mô tả đã trim |
| 2–3 | có mô tả rỗng / mảng rỗng | 400 (chỉ ra đúng phần tử) |
| 4 | bob thêm vào hội thoại của dev | 404 `conversation_not_found` |
| 5 | complete | 200, có `completedAt` |
| 6 | PATCH có `completedAt` | 400 `Unrecognized key` |
| 7 | PATCH `in_progress` + metadata | 200, `completedAt: null` |
| 8–9 | danh sách mặc định / `includeCompleted=true` | 1 việc / 2 việc |
| 10 | planning-status | số đếm đúng, 50%, nextTask = việc đang làm |
| 11 | bob xem task | 404 `task_plan_not_found` |
| 12 | **5 lệnh thêm đồng thời** (mỗi lệnh 2 việc) | cả 5 đều 201; 12 việc với `task_order` 1..12, không trùng |
| 13 | xoá, xem lại | 200 rồi 404 |
| 14 | sau khi xoá hội thoại: xem task / planning-status | 404 / 404 |

`plan_lifecycle` của hội thoại sau toàn bộ kịch bản vẫn là `NULL`, đúng ý định.

### Test

Thêm 6 unit test, tổng cộng 108:

- thêm việc nối vào cuối;
- 404 khi không sở hữu; 400 khi có mô tả rỗng và không ghi gì;
- lọc completed/skipped;
- `completedAt` theo `status`;
- 404 khi xem task của người khác; xoá cứng;
- planning status.

## Giới hạn & việc còn lại

- **TP-02 [!]:** tính lại `conversations.plan_lifecycle` sau mỗi thay đổi task. Cần code Python
  `task_plan` service.
- A35 (sinh kế hoạch bằng AI qua E7) ⇒ W4.
- Chưa có route đổi thứ tự task. Unique DEFERRABLE đã sẵn để làm khi cần.

## Điểm tranh cãi & quyết định

### TC-48 — Không ghi `plan_lifecycle` tới khi có quy tắc Python
- **Bối cảnh:** spec ghi "mọi thay đổi task tính lại `conversations.plan_lifecycle`" nhưng không có quy tắc.
  Engine đọc cột này (ENGINE_READ: "conversations: persona, plan_lifecycle…"), và luồng Continue của
  generations cũng đặt `paused`.
- **Đang chọn:** chưa ghi. Planning-status trả về giá trị đang lưu.
- **Trạng thái:** **mở — cần code Python** (TP-02).

### TC-49 — `progressPercentage` và `nextTask` (tạm)
- **Đang chọn:**
  - `progressPercentage = completed / total × 100`, làm tròn 2 chữ số. Việc `skipped` không tính là xong.
  - `nextTask` = việc `in_progress` đầu tiên theo `task_order`; không có thì lấy việc `pending` đầu tiên.
- **Trạng thái:** tạm chọn, đối chiếu khi có code Python. Chỉ là phép tính khi đọc nên đổi lại không tốn gì.

### TC-50 — Xoá task không đánh lại số thứ tự
- Spec chỉ nói "Still a hard delete". Các task còn lại giữ `task_order` cũ, nên có thể có lỗ hổng như
  1, 3, 4. Việc thêm mới vẫn nối sau số lớn nhất.

### TC-51 — `task_order` bắt đầu từ 1
- Không rõ Python bắt đầu từ 0 hay 1. Đang chọn 1.

### TC-52 — A36/A37 trả mảng, không phân trang
- Python trả `ApiResponse_list_TaskPlanRead`, spec không yêu cầu S2. Một kế hoạch thường ngắn nên giữ dạng
  mảng.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-11 | Module task-plans A36–A42, bảng `task_plans` sinh bằng script; chưa tính `plan_lifecycle` | TP-01 |
