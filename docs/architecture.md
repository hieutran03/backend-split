# Kiến trúc

Clean architecture **vừa phải**, rút gọn từ repo tham chiếu `platform` (DDD + Hexagonal):
giữ phần đáng giá nhất (business logic không biết framework, phụ thuộc hướng vào trong,
module không chạm ruột nhau), bỏ phần nặng (CQRS tách read model, Kafka, saga, một
composition root duy nhất).

## Bản đồ `src/`

```text
src/
  main.ts              bootstrap: prefix /api/v1, CORS, shutdown hooks
  app.module.ts        composition root: CoreModule + DatabaseModule + feature modules + guard/filter/interceptor
  app.entities.ts      danh sách Record TypeORM + migration (tường minh, không glob)
  data-source.ts       DataSource cho TypeORM CLI

  shared/              thuần TS, dùng chung: AppError, phân trang, Actor
  contracts/engine/    hợp đồng với AI Engine (E1 body, V3 events) — chỉ type
  platform/            kỹ thuật, business-agnostic
    ports/             interface + token mà application ĐƯỢC PHÉP thấy
    config/ auth/ database/ http/ ai-engine/(mock|http)/
    core.module.ts     @Global: config, clock, id, jwt, AI engine client
  modules/<context>/
    domain/            entity/aggregate, invariant — chỉ import shared/
    application/       use case + port outbound — import domain, shared, contracts, platform/ports
    infrastructure/    Record TypeORM, repository, adapter
    presentation/      controller, zod schema request
    <context>.module.ts wiring (useFactory + new) — nơi DUY NHẤT core gặp NestJS
    public-api.ts      bề mặt duy nhất module khác được import
```

## Luật (máy canh: `pnpm test:architecture` + ESLint)

| # | Luật | Rule |
|---|---|---|
| 1 | `domain/` chỉ import `shared/` và chính nó | `domain-is-pure` |
| 2 | `application/` không import framework/ORM; chỉ `platform/ports/*`, `contracts/`, `shared/`, `zod` | `application-depends-on-abstractions-only` + ESLint |
| 3 | Module không import ruột module khác — chỉ `public-api.ts` | `no-cross-module-internals` |
| 4 | `shared/`, `contracts/` là lá; `platform/` không biết `modules/` | `shared-and-contracts-are-leaf`, `platform-does-not-know-modules` |
| 5 | Không có vòng phụ thuộc; cấm `forwardRef()` | `no-circular` + ESLint |
| 6 | Side effect chéo miền **chỉ** qua outbox trong transaction (D9) | ⚠️ không có máy canh — review bằng mắt |

## Khác với `platform` ở đâu và vì sao

| platform | repo này | Lý do |
|---|---|---|
| 1 composition root, không có module nghiệp vụ | mỗi context 1 Nest module, wiring bằng `useFactory` | 2 người code song song, mỗi người sở hữu file module của mình, ít conflict |
| Command/Query handler tách, read model riêng | Use case class, repository dùng cho cả đọc | CRUD là chủ yếu; tách CQRS chỉ khi một module cần |
| Kafka + inbox | Outbox → HTTP tới Engine (E2/E5/E8/E9) | Đúng thiết kế split, không có broker |
| `contexts/` + `integration/` + `transport/` | `modules/<x>/presentation` | Ít thư mục, controller nằm cạnh module |

## Luồng một request

```text
HTTP → JwtAuthGuard (Actor) → Controller (ZodValidationPipe) → UseCase.execute(actor, input)
     → Domain (invariant) → Repository port → TypeORM (DbContext.manager, tự vào transaction)
     → View → EnvelopeInterceptor {success, code:"ok", message, data}
Lỗi: AppError/ValidationError → AppExceptionFilter → {success:false, code, message, data:{reason|errors}}
```

## Transaction

```ts
await this.transactions.run(async () => {
  await this.projects.save(project);        // repo tự lấy manager của transaction
  await this.outbox.enqueue({ ... });        // cùng transaction ⇒ commit cùng nhau
});
```

`DbContext` giữ EntityManager của transaction trong AsyncLocalStorage, nên use case không truyền
manager. Transaction lồng nhau dùng lại transaction ngoài.

## DB

- Schema bảng hiện có thuộc **Alembic** tới P3 (§6.3 S7). `synchronize` luôn tắt.
- Migration trong repo là **baseline cho DB local trống** — không chạy lên DB dùng chung.
- Tên cột snake_case giữ nguyên để Engine đọc chung; Python không đặt DB default cho
  `id/created_at/updated_at` ⇒ app tự gán (không dùng `@CreateDateColumn`).
