# 004 — Tài liệu API (Swagger)

> Task: F-16 · Ngày: 2026-11-09 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Swagger là một **trang web tự sinh** liệt kê mọi API của backend: đường dẫn, cần gửi gì, nhận về gì,
lỗi nào có thể xảy ra. Có thể bấm thử ngay trên trang mà không cần Postman hay viết code.

Mở `http://localhost:3000/docs`, bấm **Authorize**, dán token (lấy bằng `pnpm -s token:dev`), rồi
chọn API bất kỳ → *Try it out* → *Execute*.

Điểm quan trọng: tài liệu được sinh **từ chính phần kiểm tra dữ liệu đầu vào**, nên tài liệu và
hành vi thật không thể "lệch nhau" — sửa luật kiểm tra là tài liệu tự đổi theo.

## Vấn đề cần giải quyết

- Backend dùng **zod** để kiểm tra dữ liệu (không dùng class DTO của Nest). Swagger của Nest mặc định
  chỉ hiểu class DTO ⇒ nếu làm theo cách thường thì phải viết mỗi request hai lần.
- Mọi response đều bọc envelope `{success, code, message, data}` ⇒ tài liệu phải thể hiện đúng vỏ bọc này.
- Không để lộ tài liệu API ở production nếu không chủ động bật.

## Đã giải quyết thế nào

- Viết bộ "cầu nối" nhỏ: chuyển schema zod → định dạng OpenAPI (zod 4 có sẵn `z.toJSONSchema`
  với chế độ `openapi-3.0`).
- Các decorator ngắn gọn để gắn vào controller: `@ApiZodBody`, `@ApiZodQuery`, `@ApiUuidParam`,
  `@ApiEnvelope`, `@ApiErrors`.
- Schema response khai báo kiểu `z.ZodType<ProjectView>` ⇒ nếu dữ liệu trả ra đổi mà tài liệu
  không đổi theo, **compiler báo lỗi**.
- Bật mặc định ở dev/test, tắt ở production trừ khi đặt `SWAGGER_ENABLED=true`.

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Cầu nối zod → OpenAPI + decorator | [src/platform/http/openapi.ts](../../src/platform/http/openapi.ts) |
| Setup Swagger | [src/platform/http/swagger.ts](../../src/platform/http/swagger.ts) |
| Bật trong bootstrap | [src/main.ts](../../src/main.ts) |
| Ví dụ dùng | [projects.controller.ts](../../src/modules/projects/presentation/projects.controller.ts), [projects.schemas.ts](../../src/modules/projects/presentation/projects.schemas.ts) |

### Code then chốt

```ts
export function zodToOpenApi(schema: ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' });
  delete json.$schema;
  return json as SchemaObject;
}
```

Cách gắn vào một route:

```ts
@Post()
@ApiOperation({ summary: 'Tạo project (PJ2)' })
@ApiZodBody(createProjectSchema)                                   // cùng schema với ZodValidationPipe
@ApiEnvelope(projectViewSchema, { status: 201, message: 'Created successfully' })
@ApiErrors(400, 401)
public create(@CurrentActor() actor: Actor,
              @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectBody) { … }
```

### Kết quả sinh ra (chạy thật 2026-11-09, `GET /docs-json`)

```text
GET    /api/v1/health                    Liveness (H9)
GET    /api/v1/health/dependencies       Trạng thái PostgreSQL + AI Engine
GET    /api/v1/projects                  query: page, limit, sort | 200, 400, 401 | bearer
POST   /api/v1/projects                  body | 201, 400, 401 | bearer
GET    /api/v1/projects/{projectId}      200, 400, 401, 404 | bearer
PATCH  /api/v1/projects/{projectId}      200, 400, 401, 404 | bearer
DELETE /api/v1/projects/{projectId}      200, 400, 401, 404 | bearer
POST   /api/v1/dev/engine/turns          application/x-ndjson | bearer
```

Body của `POST /projects` trong tài liệu (sinh từ zod):

```json
{"type":"object","required":["name"],"properties":{
  "name":{"type":"string","minLength":1,"maxLength":255,"example":"Báo cáo Q3"},
  "description":{"type":"string","nullable":true,"maxLength":5000},
  "instructions":{"type":"string","nullable":true,"maxLength":20000,
    "description":"Đi vào body E1 (projectInstructions) cho mọi hội thoại của project"}}}
```

### Sửa kèm: build ra thư mục rỗng

Khi kiểm tra Swagger phát hiện `pnpm build` báo thành công nhưng `dist/` trống. Nguyên nhân:
`incremental: true` + Nest xoá `dist/` trước khi build ⇒ file `.tsbuildinfo` vẫn ghi "đã build xong"
nên TypeScript không xuất file nào. Sửa: tắt `incremental` trong `tsconfig.build.json`
(typecheck khi dev vẫn incremental). Đã build hai lần liên tiếp để xác nhận.

## Cách thử

```bash
pnpm dev
# mở http://localhost:3000/docs
# JSON OpenAPI cho FE sinh client: http://localhost:3000/docs-json
```

## Giới hạn & việc còn lại

- Nếu `/docs` trả 404: kiểm `SWAGGER_ENABLED` và `NODE_ENV` — production tắt mặc định; xem log khởi động có dòng `Swagger UI: …`.

- `/docs` nằm ngoài prefix `/api/v1` và không cần token (chỉ là tài liệu); production tắt mặc định.
- Response stream (SSE, AI SDK) chỉ mô tả bằng chữ — OpenAPI không mô tả được từng frame.
- Các module sau phải tự gắn decorator — đã ghi vào [how-to-add-a-module.md](../how-to-add-a-module.md) §3b.

## Điểm tranh cãi & quyết định

### TC-14 — Sinh tài liệu từ zod bằng thư viện ngoài hay tự viết cầu nối?
- **Phương án:**
  - A) Thư viện `nestjs-zod` — nhiều tính năng (DTO từ zod, patch Swagger); thêm phụ thuộc, phải chờ
    thư viện theo kịp zod 4 / Nest 11.
  - B) **Tự viết ~150 dòng** dùng `z.toJSONSchema` có sẵn của zod 4.
  - C) Viết DTO class riêng cho Swagger — trùng lặp, dễ lệch.
- **Đang chọn:** B — ít phụ thuộc, hiểu hết code; nếu sau này thiếu tính năng thì chuyển A.
- **Trạng thái:** tạm chọn.

### TC-15 — Bật Swagger ở môi trường nào?
- **Đang chọn:** bật ở dev/test, **tắt ở production** trừ khi `SWAGGER_ENABLED=true`; `/docs` không cần token.
- **Trạng thái:** tạm chọn — staging có bật không thì chờ Hiếu.

### TC-16 — Response schema khai báo tay có thể lệch với dữ liệu thật?
- **Bối cảnh:** Request schema được dùng thật để validate nên không lệch; response schema chỉ dùng cho tài liệu.
- **Đang chọn:** khai báo `z.ZodType<ProjectView>` để compiler báo khi lệch kiểu.
- **Hạn chế:** chỉ bắt lệch **kiểu**, không bắt lệch định dạng (vd. quên `format: uuid`).
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | Swagger `/docs`, cầu nối zod, annotate projects/health/dev; sửa build `incremental` | Hiếu yêu cầu |
| v1.1 | 2026-11-09 | **Sửa lỗi `/docs` trả 404.** `.env` có dòng `SWAGGER_ENABLED=` (để trống) ⇒ zod parse chuỗi rỗng thành `false` ⇒ Swagger bị tắt âm thầm. Sửa ở `loadConfig`: mọi biến để trống được coi là chưa đặt (dùng mặc định). Thêm 4 test config. | Hiếu báo docs không lên |

## Gợi ý review

- TC-15: staging có bật Swagger không?
- FE có định sinh client từ `/docs-json` không? Nếu có thì nên thống nhất tên `operationId`.
- Có cần bật Swagger ở môi trường staging không?
