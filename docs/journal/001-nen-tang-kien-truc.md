# 001 — Nền tảng & kiến trúc

> Task: F-01 … F-06, F-12 · Ngày: 2026-11-09 · Trạng thái: đã review (2026-11-10)
>
> **Cập nhật 2026-11-20 — tách database ([021](021-tach-database.md)):** Luật "schema DB thuộc Alembic" và "migration chỉ cho DB local" không còn đúng: backend có **DB riêng**, migration NestJS là schema thật của nó. Outbox sẽ được relay đẩy lên Redis Streams (BUS-01), không gọi HTTP Engine. Thêm luật 7 + máy canh `src/app.entities.spec.ts`. Rà lại 2026-11-25: các đoạn trong bài còn theo kế hoạch DB dùng chung đã được gạch và sửa ngay tại chỗ.

## Tóm tắt dễ hiểu

Đây là "móng nhà" của backend mới. Chưa có tính năng người dùng nhìn thấy, nhưng mọi
tính năng sau đều dựa vào nó:

- **Đăng nhập bằng token**: mọi API đều phải có "vé" (access token) hợp lệ, trừ vài API công khai
  như kiểm tra sức khoẻ hệ thống. Token cũ của hệ thống Python vẫn dùng được trong giai đoạn chuyển.
- **Câu trả lời thống nhất**: API nào cũng trả cùng một khuôn `{ success, code, message, data }`,
  nên ứng dụng phía người dùng chỉ cần một cách đọc.
- **Báo lỗi rõ ràng**: nhập sai thì báo đúng ô nào sai; xem dữ liệu của người khác thì báo
  "không tìm thấy" (không tiết lộ là dữ liệu đó có tồn tại).
- **Không mất việc dở dang**: khi một thao tác cần báo cho AI Engine (ví dụ xoá project), lời nhắn
  được ghi vào "hộp thư đi" (outbox) cùng lúc với dữ liệu — hoặc cả hai cùng được lưu, hoặc không cái nào.

## Vấn đề cần giải quyết

- Spec (§4.1) yêu cầu chuẩn mới: envelope có `code` luôn có, validation trả 400 kèm danh sách lỗi
  theo field, không sở hữu ⇒ 404 (D15), phân trang `{items, meta}`.
- JWT phải tương thích Python: HS256, cùng `SECRET_KEY`, chấp nhận token cũ không có claim `type` (D19),
  từ chối `type=refresh|widget`.
- Side effect sang Engine phải qua outbox trong cùng transaction (D9) — không được gọi Engine trước khi commit.
- ~~Schema DB hiện thuộc Alembic (Python) ⇒ không được để TypeORM tự sửa schema.~~ **Sửa 25/11 (tách DB):** backend có DB riêng, schema do migration NestJS làm chủ nhưng phải giữ giống Alembic để ETL chép dữ liệu 1:1 lúc cutover ⇒ vẫn không để TypeORM tự sửa schema (`synchronize`), mọi thay đổi đi qua migration.
- Hai người cùng làm (giờ là Claude làm, Hiếu review) ⇒ cần luật kiến trúc có **máy canh**, không chỉ là quy ước.

## Đã giải quyết thế nào

Chia code thành 4 tầng, giống chia một nhà hàng thành bếp – quầy – kho:

- `domain/` — **công thức nấu**: luật nghiệp vụ thuần tuý (tên project không được rỗng…), không biết gì
  về web hay database.
- `application/` — **bếp trưởng**: điều phối một việc cụ thể (tạo project, xoá project…).
- `infrastructure/` — **kho**: đọc/ghi database.
- `presentation/` — **quầy**: nhận request HTTP, kiểm tra đầu vào, trả kết quả.

Một công cụ tự động (`pnpm test:architecture`) đánh trượt build nếu "công thức" lén gọi database,
hoặc module này thò tay vào ruột module khác. Đã thử cố tình vi phạm — công cụ bắt được cả hai.
Từ 20/11 thêm một test (`src/app.entities.spec.ts`) chặn mọi Record/SQL chạm bảng của AI Engine — backend chỉ
dùng DB của chính mình (luật 7 trong [architecture.md](../architecture.md)).

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Config đọc env một chỗ (zod) | [src/platform/config/app-config.ts](../../src/platform/config/app-config.ts) |
| JWT tương thích Python | [src/platform/auth/jwt-token.service.ts](../../src/platform/auth/jwt-token.service.ts) |
| Guard toàn cục | [src/platform/http/jwt-auth.guard.ts](../../src/platform/http/jwt-auth.guard.ts) |
| Envelope thành công | [src/platform/http/envelope.interceptor.ts](../../src/platform/http/envelope.interceptor.ts) |
| Map lỗi → envelope | [src/platform/http/app-exception.filter.ts](../../src/platform/http/app-exception.filter.ts) |
| Transaction qua AsyncLocalStorage | [src/platform/database/db-context.ts](../../src/platform/database/db-context.ts) |
| Outbox | [src/platform/database/outbox/typeorm-outbox.ts](../../src/platform/database/outbox/typeorm-outbox.ts) |
| Luật kiến trúc | [.dependency-cruiser.cjs](../../.dependency-cruiser.cjs), [eslint.config.mjs](../../eslint.config.mjs) |
| Migration — schema DB backend, sinh từ Record ([009](009-migration-sinh-bang-script.md); baseline viết tay cũ đã xoá) | [src/platform/database/migrations/](../../src/platform/database/migrations/) |

### Code then chốt

Transaction không cần truyền tay — repository tự "nhảy vào" transaction đang mở:

```ts
// db-context.ts
public get manager(): EntityManager {
  return this.storage.getStore() ?? this.dataSource.manager;
}
public async transaction<T>(work: () => Promise<T>, isolation = 'READ COMMITTED') {
  if (this.inTransaction) return work();            // lồng nhau => dùng lại transaction ngoài
  return this.dataSource.transaction(isolation, (m) => this.storage.run(m, work));
}
```

Outbox từ chối nếu bị gọi ngoài transaction (bắt lỗi lập trình sớm):

```ts
if (!this.db.inTransaction) {
  throw new Error('Outbox.enqueue() phải được gọi bên trong TransactionManager.run()');
}
```

JWT: token cũ không có `type` vẫn được nhận khi `JWT_ACCEPT_LEGACY_ACCESS=true`:

```ts
if (type === undefined) {
  if (!this.options.acceptLegacyAccess) throw new UnauthorizedError(..., 'legacy_token_rejected');
} else if (type !== 'access') {
  throw new UnauthorizedError('Wrong token type', 'wrong_token_type'); // refresh, widget
}
```

### Request / Response mẫu (chạy thật 2026-11-09)

Không có token:

```http
GET /api/v1/projects
```
```json
{"success":false,"code":"unauthorized","message":"Missing bearer token","data":{"reason":"missing_token"}}
```

Nhập sai:

```json
{"success":false,"code":"bad_request","message":"Validation failed",
 "data":{"errors":[{"field":"name","message":"Too small: expected string to have >=1 characters"}]}}
```

Bảng mã lỗi → HTTP status: `bad_request 400 · unauthorized 401 · forbidden 403 · not_found 404 ·
conflict 409 · gone 410 · unprocessable 422 · too_many_requests 429 · bad_gateway 502 ·
service_unavailable 503 · internal_error 500`.

## Cách thử

```bash
pnpm docker:up && pnpm db:migrate && pnpm db:seed && pnpm dev
pnpm verify                 # typecheck + lint + 20 unit test + kiến trúc + build
```

## Giới hạn & việc còn lại

- Chưa kiểm claim `ver` với `users.token_version` / user đã xoá (task AUTH-03).
- Outbox mới ghi được, ~~**chưa có bộ gửi** sang Engine (task OBX-02)~~ **chưa có relay** đẩy sự kiện lên Redis Streams cho Engine (BUS-01, thay OBX-02 — tách DB).
- ~~Migration trong repo chỉ dành cho DB local trống; DB thật vẫn do Alembic quản tới P3.~~ **Sửa 25/11 (tách DB):** migration trong repo là schema thật của DB backend (DB riêng — [integration.md §3](../integration.md)), sinh bằng script từ Record ([009](009-migration-sinh-bang-script.md)); Alembic chỉ còn quản DB Engine.
- Chưa có integration test với Postgres thật trong CI (F-14), log JSON + request id (F-15).

## Điểm tranh cãi & quyết định

### TC-1 — Kiến trúc: Layered theo chuẩn team hay clean architecture?
- **Bối cảnh:** Spec §5 gợi ý *Layered* (Controller → Service → Repository → Entity) theo chuẩn
  `nestjs-repository` của team. Hiếu yêu cầu "kiến trúc sạch xíu", tham khảo repo `platform`
  (DDD + Hexagonal + CQRS rất chặt).
- **Phương án:**
  - A) Layered như spec — quen thuộc với team, ít file; nhưng logic dồn vào Service, khó test không cần Nest.
  - B) Như `platform` 100% — một composition root, CQRS, Kafka; quá nặng cho ~130 route chủ yếu CRUD.
  - C) **Clean vừa phải** — giữ 4 tầng + port/adapter + máy canh, bỏ CQRS/Kafka/composition root duy nhất.
- **Đang chọn:** C.
- **Trạng thái:** tạm chọn, **chờ Hiếu chốt** (nếu team bắt buộc Layered thì cần biết sớm).
- **Nếu đổi ý sang A:** gộp `application/` + `domain/` thành `*.service.ts`, bỏ port, bỏ 2 rule kiến trúc.
  Chi phí thấp lúc này (mới 1 module mẫu), cao dần theo số module.

### TC-2 — Mỗi context một Nest module, hay một composition root như `platform`?
- **Bối cảnh:** `platform` cấm module nghiệp vụ (`OrderModule`…) để tránh module import lẫn nhau.
- **Phương án:** A) một root (đúng `platform`) · B) mỗi context một module, chỉ import qua `public-api.ts`.
- **Đang chọn:** B — dễ đọc với người quen Nest, mỗi module tự chứa wiring; vòng import vẫn bị chặn
  bởi rule `no-circular` + cấm `forwardRef()`.
- **Trạng thái:** tạm chọn, chờ review.

### TC-3 — Validation: zod hay class-validator?
- **Bối cảnh:** Nest mặc định dùng class-validator + DTO class; `platform` dùng zod.
- **Đang chọn:** zod — một schema dùng cho validate, kiểu TypeScript, và Swagger (xem 004); khớp `platform`.
- **Trạng thái:** tạm chọn.

### TC-4 — Có cho TypeORM quản lý schema không?
- **Bối cảnh:** ~~Python (Alembic) đang sở hữu schema tới P3 (§6.3 S7); hai công cụ cùng sửa một bảng là nguy hiểm.~~
  **Sửa 25/11 (tách DB):** backend có **DB riêng** ([integration.md §3](../integration.md)); Alembic chỉ còn quản DB Engine.
  Schema DB backend vẫn phải giống hệt Alembic để ETL lúc cutover chép dữ liệu 1:1 (TC-69), nên không để
  TypeORM tự đổi schema theo entity.
- **Đang chọn:** **không** tự đồng bộ — `synchronize: false`, bảng migration riêng `backend_migrations`; ~~migration
  trong repo chỉ là baseline cho DB local trống~~ migration trong repo là schema thật của DB backend, sinh bằng
  script từ Record và kiểm bằng `db:migrate:check` ([009](009-migration-sinh-bang-script.md)).
- **Trạng thái:** đã chốt theo spec; lý do đổi từ 20/11 như trên.

### TC-5 — Token cũ của Python (không có `type`) có được chấp nhận?
- **Bối cảnh:** D19 — trong lúc chuyển, token cũ phải dùng được tới khi hết hạn (≤ 10 giờ).
- **Đang chọn:** chấp nhận, có công tắc `JWT_ACCEPT_LEGACY_ACCESS` để tắt ~~sau W1~~ sau cutover (tách DB: không còn đợt W1 lên production riêng; token cũ tự hết hạn ≤ 10 giờ).
- **Trạng thái:** đã chốt theo spec.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | Bản đầu: 4 tầng, guard JWT, envelope, transaction, outbox, baseline DB | — |
| v1.1 | 2026-11-20 | Tách database backend ↔ Engine: DB riêng, outbox ⇒ Redis Streams, máy canh bảng Engine | [021](021-tach-database.md) |
| v1.2 | 2026-11-25 | Gạch và sửa tại chỗ: luật schema/migration (TC-4), "chưa có bộ gửi" ⇒ relay BUS-01, công tắc token cũ tắt sau cutover; thêm câu về máy canh bảng Engine | Hiếu thấy bài còn theo quyết định cũ (DB dùng chung) |

## Gợi ý review

- TC-1, TC-2: chia 4 tầng + mỗi context một Nest module có hợp với team không?
- Envelope/mã lỗi có khớp FE mong đợi không?
