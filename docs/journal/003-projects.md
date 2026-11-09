# 003 — Quản lý Project

> Task: F-10 (route PJ1–PJ5) · Ngày: 2026-11-09 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

**Project** là một "thư mục" gom các cuộc trò chuyện cùng chủ đề, kèm một đoạn **hướng dẫn chung**
(instructions) mà AI sẽ tuân theo trong mọi cuộc trò chuyện thuộc project đó — ví dụ
"Trả lời ngắn gọn, bằng tiếng Việt".

Người dùng có thể: tạo project, xem danh sách project của mình (có phân trang), xem chi tiết,
sửa tên/mô tả/hướng dẫn, và xoá.

Mỗi người chỉ thấy project của chính mình. Cố mở project của người khác sẽ nhận
"không tìm thấy" — hệ thống không tiết lộ project đó có tồn tại hay không.

Xoá là **xoá mềm** (đánh dấu đã xoá, không mất dữ liệu ngay), đồng thời hệ thống gửi lời nhắn
cho AI Engine để nó dọn phần "trí nhớ" gắn với project.

Module này cũng là **mẫu chuẩn** để các module sau (hội thoại, feedback…) làm theo.

## Vấn đề cần giải quyết

- Spec §4.2 PJ1–PJ5, bảng `projects` (§6): `owner_id`, `name` varchar(255), `description`, `instructions`, soft delete.
- Không sở hữu ⇒ 404 (D15). Phân trang chuẩn `?page&limit&sort`.
- Xoá project trước đây ghi thẳng vào bảng `user_memories` của Engine (C19) ⇒ nay phải đổi thành outbox `project.deleted`.
- Python không đặt default ở DB cho `id/created_at/updated_at` ⇒ app phải tự gán.

## Đã giải quyết thế nào

- **Luật nghiệp vụ** (tên 1–255 ký tự sau khi bỏ khoảng trắng, chuỗi rỗng coi như không có,
  hướng dẫn ≤ 20.000 ký tự) nằm trong `Project` — một chỗ duy nhất.
- Mọi truy vấn luôn lọc theo **chủ sở hữu + chưa xoá**, nên "của người khác" và "không tồn tại"
  tự động giống nhau.
- Xoá: đánh dấu xoá + ghi outbox **trong cùng một transaction**.

## Chi tiết kỹ thuật

### File chính

```text
src/modules/projects/
  domain/project.ts                         luật nghiệp vụ
  application/ports/project.repository.ts   interface kho dữ liệu
  application/project.use-cases.ts          Create / List / Get / Update / Delete
  application/project.view.ts               dữ liệu trả ra ngoài
  application/project.use-cases.spec.ts     6 unit test
  infrastructure/project.record.ts          bảng `projects` (TypeORM)
  infrastructure/typeorm-project.repository.ts
  presentation/projects.schemas.ts          zod: validate + Swagger
  presentation/projects.controller.ts
  projects.module.ts                        wiring
  public-api.ts
```

### Code then chốt

```ts
// Xoá mềm + outbox trong một transaction (DeleteProjectUseCase)
await this.transactions.run(async () => {
  const project = await this.projects.findOwned(projectId, actor.userId);
  if (!project) throw new NotFoundError('project');
  project.softDelete(this.clock.now());
  await this.projects.save(project);
  await this.outbox.enqueue({
    eventType: 'project.deleted', aggregateType: 'project', aggregateId: project.id,
    payload: { projectId: project.id, ownerId: project.ownerId },
  });
});
```

```ts
// Repository: chỉ tìm trong project của chính mình, chưa xoá
this.repo.findOneBy({ id, ownerId, deletedAt: IsNull() });
```

### Request / Response mẫu (chạy thật 2026-11-09)

| Method | Path | Ý nghĩa |
|---|---|---|
| GET | `/api/v1/projects?page=1&limit=20&sort=-updatedAt` | danh sách (sort: `createdAt`, `updatedAt`, `name`) |
| POST | `/api/v1/projects` | tạo |
| GET | `/api/v1/projects/{projectId}` | chi tiết |
| PATCH | `/api/v1/projects/{projectId}` | sửa (ít nhất 1 trường) |
| DELETE | `/api/v1/projects/{projectId}` | xoá mềm |

Tạo — tên có khoảng trắng thừa được làm gọn:

```http
POST /api/v1/projects
{"name":"  Q3 report ","instructions":"Trả lời ngắn"}
```
```json
{"success":true,"code":"ok","message":"Created successfully","data":{
  "id":"e798078d-d727-46d6-b07a-ae311bc8d386","name":"Q3 report","description":null,
  "instructions":"Trả lời ngắn","createdAt":"2026-11-09T02:20:24.210Z","updatedAt":"2026-11-09T02:20:24.210Z"}}
```

Danh sách:

```json
{"success":true,"code":"ok","message":"Get data successfully","data":{
  "items":[{"id":"e798078d-…","name":"Q3 report",…}],
  "meta":{"page":1,"limit":5,"total":1,"totalPages":1}}}
```

User khác mở project này:

```json
{"success":false,"code":"not_found","message":"project not found","data":{"reason":"project_not_found"}}
```

Xoá, rồi xem bảng outbox:

```json
{"success":true,"code":"ok","message":"Deleted successfully","data":null}
```
```text
   event_type    |             aggregate_id             | status
-----------------+--------------------------------------+---------
 project.deleted | e798078d-d727-46d6-b07a-ae311bc8d386 | pending
```

### Test

6 unit test ([project.use-cases.spec.ts](../../src/modules/projects/application/project.use-cases.spec.ts)):
trim tên & rỗng ⇒ null; tên rỗng ⇒ 400; user khác ⇒ 404 cho get/update/delete; danh sách chỉ của mình
+ meta đúng; update đổi `updatedAt`; delete chạy đúng 1 transaction và ghi đúng 1 event outbox.

## Cách thử

Swagger `/docs` → nhóm **projects** → *Authorize* bằng `pnpm -s token:dev`. Để thử "user khác",
lấy token thứ hai bằng `pnpm -s token:dev` kèm `OTHER_USER_ID` trong [scripts/dev-users.ts](../../scripts/dev-users.ts).

## Giới hạn & việc còn lại

- PJ-05: thứ tự khoá project → hội thoại như Python, và xử lý hội thoại đang gắn khi xoá project.
- PJ6–PJ9: gắn/gỡ hội thoại, custom agents của project.
- Event `project.deleted` mới nằm trong outbox, chưa được gửi tới Engine (OBX-02).

## Điểm tranh cãi & quyết định

### TC-10 — Xoá project đang có hội thoại: gỡ liên kết hay chặn?
- **Bối cảnh:** `conversations.project_id` trỏ tới project. Spec chỉ ghi "phải tính tới hội thoại
  đang gắn", không nói rõ hành vi; chưa đọc được code Python.
- **Phương án:**
  - A) Gỡ liên kết (`project_id = NULL`) — hội thoại còn nguyên, chỉ rời khỏi project.
  - B) Chặn xoá (409) khi còn hội thoại — an toàn nhưng phiền cho người dùng.
  - C) Xoá mềm luôn các hội thoại — mạnh tay, dễ mất dữ liệu ngoài ý muốn.
- **Đang chọn:** chưa làm (v1 chỉ xoá project, hội thoại giữ nguyên `project_id` trỏ tới project đã xoá).
  Nghiêng về A.
- **Trạng thái:** **mở** — task PJ-05, cần đối chiếu Python.

### TC-11 — Giới hạn độ dài `instructions`
- **Bối cảnh:** DB là `text` (không giới hạn); spec không nói. Instructions đi vào mọi lượt chat ⇒ quá dài
  sẽ tốn token.
- **Đang chọn:** 20.000 ký tự (domain + zod).
- **Trạng thái:** tạm chọn — nếu Python không giới hạn, có thể dữ liệu cũ dài hơn; `Project.restore()`
  không kiểm lại nên dữ liệu cũ vẫn đọc được, chỉ chặn khi sửa.

### TC-12 — Trả 404 cho cả "không tồn tại" và "của người khác"?
- **Bối cảnh:** Python trước đây 403/404 lẫn lộn. Spec D15: luôn 404 để không lộ sự tồn tại.
- **Đang chọn:** 404 — repository lọc theo `owner_id` nên hai trường hợp tự nhiên giống nhau.
- **Trạng thái:** đã chốt theo spec.

### TC-13 — Xoá project báo cho Engine thế nào?
- **Bối cảnh:** Python đang xoá mềm `user_memories` (bảng của Engine) ngay trong transaction của mình (C19).
  Sau khi tách, backend không được ghi bảng Engine.
- **Đang chọn:** outbox `project.deleted` trong cùng transaction; Engine tự dọn khi nhận.
- **Hệ quả cần biết:** trong khoảng giữa (outbox chưa gửi), memory của project vẫn còn ở Engine — chấp nhận
  được vì project đã ẩn với người dùng.
- **Trạng thái:** đã chốt theo spec.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | PJ1–PJ5: CRUD, phân trang, xoá mềm + outbox | — |
| v1.1 | 2026-11-09 | Thêm tài liệu Swagger cho 5 route, `projectViewSchema` | F-16 |

## Gợi ý review

- TC-10: xoá project đang có hội thoại nên xử lý thế nào?
- TC-11: giới hạn 20.000 ký tự cho instructions có hợp lý không?
