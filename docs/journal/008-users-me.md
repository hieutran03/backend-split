# 008 — Hồ sơ của tôi (`GET /users/me`)

> Task: USR-01 (route A5) · Ngày: 2026-11-09 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Ứng dụng gọi một API duy nhất để lấy thông tin người đang đăng nhập: tên, email, ảnh đại diện, vai trò.
Trước đây API này nhận **mã người dùng trên đường dẫn** (`/users/<id>`) dù thực tế chỉ được xem chính mình —
thừa và dễ gây hiểu nhầm. Giờ đường dẫn cố định là `/users/me`, người dùng được xác định từ token.

Với lượt này, cụm **tài khoản** của đợt W1 đã đủ: đăng ký, đăng nhập, làm mới phiên, đăng xuất, kiểm phiên
bản token, xem hồ sơ.

## Vấn đề cần giải quyết

- Spec A5: `GET /users/{user_id}` ⇒ `GET /api/v1/users/me`, "path id removed (own profile only anyway)".
- Response giữ đúng tên trường `UserRead` của Python + `role` (giống A1).

## Đã giải quyết thế nào

- Use case `GetMeUseCase` đọc user theo `actor.userId` (lấy từ token qua guard).
- Dùng lại `UserView` / `userViewSchema` của đăng ký ⇒ hai API trả cùng một hình dạng user.
- Nếu tài khoản bị xoá đúng trong khoảng giữa guard và lúc đọc (hoặc trong cửa sổ cache ≤ 30 s của guard)
  ⇒ 404 `user_not_found`, như mọi tài nguyên không tồn tại (D15).

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Use case | [src/modules/identity/application/user.use-cases.ts](../../src/modules/identity/application/user.use-cases.ts) |
| Controller | [src/modules/identity/presentation/users.controller.ts](../../src/modules/identity/presentation/users.controller.ts) |
| Wiring | [src/modules/identity/identity.module.ts](../../src/modules/identity/identity.module.ts) |

```ts
public async execute(actor: Actor): Promise<UserView> {
  const user = await this.users.findActiveById(actor.userId);
  if (!user) throw new NotFoundError('user');
  return toUserView(user);
}
```

### Request / Response mẫu (chạy thật 2026-11-09)

```http
GET /api/v1/users/me
Authorization: Bearer <access token>
```
```json
{"success":true,"code":"ok","message":"OK","data":{
  "id":"00000000-0000-4000-8000-000000000001","username":"dev","email":"dev@example.local",
  "avatarUrl":null,"role":"user","createdAt":"2026-11-09T02:20:13.063Z",
  "updatedAt":"2026-11-09T02:20:13.063Z","deletedAt":null}}
```

| Kịch bản | Kết quả |
|---|---|
| có token | 200, không có `passwordHash` |
| không token | 401 `missing_token` |
| đường cũ `/api/v1/users/{id}` | 404 (không còn route này) |
| Swagger | nhóm **users** có `/users/me` |

### Test

2 test mới (tổng 72): trả đúng hồ sơ, không lộ hash; user bị xoá giữa chừng ⇒ 404 `user_not_found`.

## Sự cố trong lượt

Bước nối controller vào module lần đầu **không ăn**: script sửa file tìm theo định dạng cũ, nhưng prettier
đã gộp dòng import ⇒ bước sửa bị bỏ qua, mà `pnpm verify` vẫn xanh (controller chưa đăng ký thì không có lỗi
biên dịch). Phát hiện khi đọc log của script, sửa lại, rồi **chạy thật** để chắc route có mặt. Bài học:
với thay đổi wiring, luôn kiểm bằng request thật hoặc Swagger chứ không chỉ dựa vào `verify`.

## Giới hạn & việc còn lại

- Chưa có API sửa hồ sơ / đổi mật khẩu / xoá tài khoản — không có trong bảng mapping W1 (spec chỉ có A1–A5).
  Khi làm đổi mật khẩu thì phải tăng `token_version` (xem 007).
- Route cũ `/users/{user_id}` sẽ do lớp tương thích LEG-01 trả lời.

## Điểm tranh cãi & quyết định

Không có điểm mới — hành vi theo đúng spec A5.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | `GET /users/me` | USR-01 |

## Gợi ý review

- FE có cần thêm trường nào trong hồ sơ (vd. `tokenVersion`, thời điểm đăng nhập cuối) không?
