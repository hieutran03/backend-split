# Thêm một module (copy từ `projects`)

Ví dụ: module `feedback` (task FB-01).

## 1. Lấy task

Sửa [PLAN.md](PLAN.md): `[ ]` → `[~] (Hiếu, 2026-11-10)`, commit.

## 2. Tra spec

- Route: [reference/route-mapping.md](reference/route-mapping.md) (nhóm Feedback: A30, A32–A34).
- Bảng: [reference/database-schema.md](reference/database-schema.md) (`feedbacks`).
- Chi tiết dễ trượt: [reference/engine-contract.md](reference/engine-contract.md) mục cuối.

## 3. Tạo cây thư mục

```text
src/modules/feedback/
  domain/feedback.ts                     # aggregate + invariant (rating 1–5)
  application/ports/feedback.repository.ts
  application/feedback.use-cases.ts      # Create/Get/Update
  application/feedback.view.ts
  application/feedback.use-cases.spec.ts # fake repo, test user khác ⇒ 404
  infrastructure/feedback.record.ts      # @Entity('feedbacks'), cột snake_case
  infrastructure/typeorm-feedback.repository.ts
  presentation/feedback.schemas.ts       # zod
  presentation/feedback.controller.ts
  feedback.module.ts                     # useFactory wiring
  public-api.ts
```

## 4. Đăng ký

- `src/app.entities.ts`: thêm `FeedbackRecord` vào `ALL_ENTITIES`.
- `src/app.module.ts`: thêm `FeedbackModule` vào `featureModules`.
- Bảng chưa có trong baseline ⇒ thêm migration dev `src/platform/database/migrations/<ts>-<name>.ts`
  và đưa vào `ALL_MIGRATIONS`.

## 5. Cần dữ liệu của module khác?

Ví dụ feedback cần biết message có thuộc user không. **Không** import repository của `messages`.
Hai cách:
1. Khai báo port trong `feedback/application/ports/message-ownership.ts`, module `messages`
   export adapter qua `public-api.ts`, `feedback.module.ts` import `MessagesModule` và bind port.
2. Đơn giản hơn ở phase này: repository của feedback join bảng `messages`/`conversations` để kiểm
   owner (đọc thôi, không ghi bảng module khác).

## 6. Kiểm tra

```bash
pnpm verify           # typecheck + lint + unit + architecture + build
pnpm dev              # chạy thử, token: pnpm -s token:dev
```

Xong ⇒ đổi `[~]` → `[x]` trong PLAN, thêm 1 dòng Nhật ký.
