# Thêm một module (copy từ `projects`)

Ví dụ: module `feedback` (task FB-01).

## 1. Lấy task

Sửa [PLAN.md](PLAN.md): `[ ]` → `[~] (<ngày bắt đầu>)` (WIP = 1, xem [AGENTS.md](../AGENTS.md)), commit.

## 2. Tra spec

- Route: [reference/route-mapping.md](reference/route-mapping.md) (nhóm Feedback: A30, A32–A34).
- Bảng: [reference/database-schema.md](reference/database-schema.md) (`feedbacks`).
- Chi tiết dễ trượt: [reference/engine-contract.md](reference/engine-contract.md) mục cuối.

## 3. Tạo cây thư mục

```text
src/modules/feedback/
  domain/feedback.ts                     # aggregate + invariant (rating 1–5)
  application/ports.ts                   # port outbound: FeedbackRepository, MessageAccess
  application/feedback.use-cases.ts      # Create/Get/Update + FeedbackView
  application/feedback.use-cases.spec.ts # fake repo, test user khác ⇒ 404
  infrastructure/feedback.record.ts      # @Entity('feedbacks'), cột snake_case
  infrastructure/typeorm-feedback.repository.ts
  infrastructure/message-access.adapter.ts # kiểm message thuộc user, qua public-api của messages
  presentation/feedback.schemas.ts       # zod
  presentation/feedback.controller.ts
  feedback.module.ts                     # useFactory wiring
  public-api.ts
```

## 3b. Swagger

Controller dùng chính schema zod để sinh tài liệu (không viết DTO class):

```ts
@ApiTags('feedback') @ApiBearerAuth(BEARER_AUTH) @Controller(...)
...
@Post()
@ApiOperation({ summary: 'Gửi feedback (A30)' })
@ApiZodBody(createFeedbackSchema)                    // cùng schema với ZodValidationPipe
@ApiEnvelope(feedbackViewSchema, { status: 201 })    // z.ZodType<FeedbackView> để compiler canh lệch
@ApiErrors(400, 401, 404, 409)
```

Kiểm tra trên `/docs` sau khi `pnpm dev`.

## 4. Đăng ký

- `src/app.entities.ts`: thêm `FeedbackRecord` vào `ALL_ENTITIES`.
- `src/app.module.ts`: thêm `FeedbackModule` vào `featureModules`.
- Bảng mới / cột mới ⇒ **sinh** migration, không viết tay:
  `pnpm db:migrate:generate AddFeedbacks` → đọc file sinh ra, đối chiếu spec →
  `pnpm db:migrate && pnpm db:migrate:check` (phải báo không còn khác biệt) →
  `pnpm db:migrate:revert && pnpm db:migrate`. Xem [journal/009](journal/009-migration-sinh-bang-script.md).

## 5. Cần dữ liệu của module khác?

Ví dụ feedback cần biết message có thuộc user không. **Không** import repository của `messages`.
Hai cách:
1. Khai báo port trong `feedback/application/ports/message-ownership.ts`, module `messages`
   export adapter qua `public-api.ts`, `feedback.module.ts` import `MessagesModule` và bind port.
2. Đơn giản hơn ở phase này: repository của feedback join bảng `messages`/`conversations` để kiểm
   owner (đọc thôi, không ghi bảng module khác).

## 5b. Cần dữ liệu của AI Engine, hoặc phải báo cho Engine?

Engine có **database riêng** ([integration.md](integration.md)) — không có Record, không có SQL nào trỏ vào bảng của nó
(`src/app.entities.spec.ts` sẽ đỏ).
- Cần đọc dữ liệu Engine để trả FE ⇒ gọi `AiEngineClient` (E10–E12, MCP).
- Thay đổi mà Engine phải biết (xoá, sửa, upload…) ⇒ `outbox.enqueue({ eventType, … })` **trong transaction**; nếu là
  loại sự kiện mới thì thêm vào `src/contracts/events/backend-events.ts` và bảng §6.4 của integration.md trước.
- Engine cần đọc dữ liệu của module mới ⇒ đưa kèm vào E1, hoặc thêm một route B-API ở
  `src/contracts/backend/internal-api.ts`. Không cấp quyền DB cho Engine.
- Bảng mới ⇒ thêm tên bảng vào danh sách bảng backend trong `src/app.entities.spec.ts` và `database-schema.md`.

## 6. Kiểm tra

```bash
pnpm verify           # typecheck + lint + unit + architecture + build
pnpm dev              # chạy thử, token: pnpm -s token:dev
```

Xong ⇒ viết nhật ký `docs/journal/`, đổi `[~]` → `[r]` trong PLAN (chỉ Hiếu chuyển `[r]` → `[x]`), thêm 1 dòng Nhật ký.

Muốn xem chạy thật từ đầu tới cuối: thêm một kịch bản vào `scripts/demo/scenarios/` rồi `pnpm demo --only <id>` ([demo.md](demo.md)).
