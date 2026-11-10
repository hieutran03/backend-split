# 007 — Guard kiểm phiên bản token & tài khoản đã xoá

> Task: AUTH-03 · Ngày: 2026-11-09 · Trạng thái: đã review (2026-11-10)

## Tóm tắt dễ hiểu

Trước đây, chỉ cần cầm một access token còn hạn là gọi được API — kể cả khi tài khoản đã bị xoá.
Giờ mỗi request, hệ thống kiểm thêm hai điều:

1. **Tài khoản còn hoạt động không?** Bị xoá ⇒ từ chối (`user_inactive`).
2. **Token có còn "đời" hiện tại không?** Mỗi user có một số *phiên bản token* (`token_version`). Khi hệ
   thống muốn vô hiệu mọi token cũ của ai đó (xoá tài khoản, sau này: đổi mật khẩu, "đăng xuất mọi nơi"),
   chỉ cần tăng số này lên 1 — mọi token mang số cũ bị từ chối (`token_revoked`).

Để không phải hỏi database ở **mỗi** request, kết quả được nhớ tạm tối đa **30 giây** — giống hệ thống
Python. Nghĩa là: xoá tài khoản thì tối đa 30 giây sau mọi token của người đó mới hết tác dụng.

## Vấn đề cần giải quyết

- §11 "Token version": claim `ver` trong access/refresh, thiếu = 0. Guard đọc `users.token_version` +
  `deleted_at` qua cache ≤ 30 s; xoá mềm user tăng version. NestJS phải kiểm **giống hệt**.
- Spec ⚠️: "nếu không, user đã xoá vẫn dùng được token cũ sau W1".
- Ràng buộc kiến trúc: guard nằm ở `platform/`, còn bảng `users` thuộc module `identity` — `platform`
  không được import module nghiệp vụ.

## Đã giải quyết thế nào

- `platform` khai báo một **port** `UserTokenStateReader` ("cho tôi biết version và trạng thái của user X").
- Module `identity` (chủ bảng `users`) cài đặt port: một bản đọc DB, bọc bởi một bản **cache**, rồi
  **export** cho guard dùng. Luật kiến trúc giữ nguyên, không có import ngược.
- Cache có giới hạn 10.000 user (đầy thì bỏ cái cũ nhất), và cache cả kết quả "không có user này" để token
  giả mạo `sub` không thể dội liên tục vào DB.
- Thời gian cache cấu hình `AUTH_USER_STATE_CACHE_SECONDS` (0–30, mặc định 30; quá 30 thì app không khởi động).

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Port | [src/platform/ports/user-token-state.port.ts](../../src/platform/ports/user-token-state.port.ts) |
| Guard | [src/platform/http/jwt-auth.guard.ts](../../src/platform/http/jwt-auth.guard.ts) |
| Đọc DB + cache | [src/modules/identity/infrastructure/user-token-state.readers.ts](../../src/modules/identity/infrastructure/user-token-state.readers.ts) |
| Wiring + export | [src/modules/identity/identity.module.ts](../../src/modules/identity/identity.module.ts) |
| Cấu hình | `AUTH_USER_STATE_CACHE_SECONDS` trong [app-config.ts](../../src/platform/config/app-config.ts) |

### Code then chốt

Thứ tự kiểm trong guard:

```ts
const claims = this.tokens.verifyAccess(token);          // chữ ký, hạn, type (như trước)

const state = await this.userStates.read(claims.userId); // ≤ 30 s cache
if (!state || !state.active)
  throw new UnauthorizedError('Account is no longer active', 'user_inactive');
if (state.tokenVersion !== claims.tokenVersion)          // thiếu `ver` = 0
  throw new UnauthorizedError('Token is no longer valid, please log in again', 'token_revoked');
```

Wiring — cache bật/tắt theo cấu hình, identity export port cho guard toàn cục:

```ts
{
  provide: USER_TOKEN_STATE_READER,
  useFactory: (db, clock, config) => {
    const reader = new TypeOrmUserTokenStateReader(db);
    const ttlMs = config.auth.userStateCacheSeconds * 1000;
    return ttlMs > 0 ? new CachedUserTokenStateReader(reader, clock, ttlMs) : reader;
  },
  inject: [DbContext, CLOCK, APP_CONFIG],
},
// ...
exports: [USER_TOKEN_STATE_READER],
```

### Request / Response mẫu (chạy thật 2026-11-09)

Chạy hai instance cùng lúc trên Postgres local: cổng 3100 **không cache**, cổng 3101 **cache 30 s**.
Gọi `GET /api/v1/projects`:

| # | Kịch bản | 3100 (không cache) | 3101 (cache 30 s) |
|---|---|---|---|
| 1 | token `ver=0`, DB `ver=0` | 200 | 200 |
| 2 | sửa DB: `token_version = 1` | 401 `token_revoked` | **200** (còn trong cache, ≤ 30 s) |
| 3 | đăng nhập lại ⇒ token `ver=1` | 200 | |
| 4 | token cũ kiểu Python (không `type`, không `ver` ⇒ 0) khi DB `ver=1` | 401 `token_revoked` | |
| 5 | DB về `ver=0` ⇒ cùng token cũ | 200 | |
| 6 | xoá mềm user `other` | 401 `user_inactive` | |
| 7 | khôi phục `other` | 200 | |
| 8 | chữ ký hợp lệ nhưng `sub` không tồn tại | 401 `user_inactive` | |
| 9 | refresh JWT dùng làm access | 401 `wrong_token_type` | |

```json
{"success":false,"code":"unauthorized","message":"Token is no longer valid, please log in again","data":{"reason":"token_revoked"}}
{"success":false,"code":"unauthorized","message":"Account is no longer active","data":{"reason":"user_inactive"}}
```

Sau khi chạy, DB đã được trả về trạng thái ban đầu (cả hai user `ver=0`, đang hoạt động).

### Test

12 test mới (tổng 70):
- Guard (7): route `@Public` không đọc DB; thiếu token; hợp lệ ⇒ gắn `actor`; user đã xoá; `sub` không tồn
  tại; version lệch; `@AdminOnly` với user thường ⇒ 403, với admin ⇒ qua.
- Cache (5): đọc lặp trong TTL chỉ chạm DB 1 lần; thay đổi DB thấy được **đúng** sau 30 s (29.999 ms vẫn
  cũ, 30.000 ms thấy mới); `invalidate()`; cache cả user không tồn tại; đầy thì bỏ entry cũ nhất.

## Cách thử

```bash
# dùng token đang có, rồi:
docker compose exec postgres psql -U chatbot -c "update users set token_version=1 where email='dev@example.local'"
# ≤ 30 s sau: mọi API trả 401 token_revoked; đăng nhập lại là dùng được.
docker compose exec postgres psql -U chatbot -c "update users set token_version=0 where email='dev@example.local'"
```

Muốn thấy hiệu lực tức thì khi dev: `AUTH_USER_STATE_CACHE_SECONDS=0`.

## Giới hạn & việc còn lại

- Mỗi request có token giờ thêm **một truy vấn PK** khi cache trượt. Với cache 30 s, tải DB ≈ số user
  hoạt động / 30 s — chấp nhận được; nếu nhiều replica cần cache chung thì chuyển sang Redis (RDS-01).
- Chưa có chỗ nào trong backend **tăng** `token_version` (xoá user, đổi mật khẩu chưa có API). Khi có,
  gọi `invalidate(userId)` ngay để process hiện tại không đợi 30 s.
- Refresh token opaque **chưa** gắn với `token_version`: tăng version (không xoá user) thì refresh vẫn cấp
  được access token mới (mang version mới). Nếu muốn "tăng version = đá ra hoàn toàn" thì phải thu hồi luôn
  refresh token — gắn với quyết định TC-22.
- Python cache 30 s có độ lệch như nhau ở hai bên trong giai đoạn chạy song song W1.

## Điểm tranh cãi & quyết định

### TC-25 — Hai lý do lỗi riêng (`user_inactive`, `token_revoked`) hay một lý do chung?
- **Bối cảnh:** Với FE, cả hai đều có nghĩa "đăng nhập lại". Tách riêng giúp debug và hiển thị thông báo
  ("Tài khoản đã bị vô hiệu" khác "Phiên đã hết hiệu lực").
- **Rủi ro:** `user_inactive` với `sub` lạ cho kẻ có **khoá ký** biết user không tồn tại — nhưng ai có khoá ký
  thì đã kiểm soát toàn bộ hệ thống, nên không đáng kể.
- **Đang chọn:** tách riêng.
- **Trạng thái:** tạm chọn.

### TC-26 — Cache trong process hay Redis?
- **Phương án:** A) Map trong process, 30 s (giống Python) · B) Redis dùng chung các replica — đồng bộ hơn,
  có thể xoá cache tức thì cho mọi replica, nhưng thêm một hop mạng mỗi request và phụ thuộc Redis.
- **Đang chọn:** A — đúng mức spec yêu cầu (≤ 30 s), không thêm phụ thuộc. Port đã sẵn để đổi sang B.
- **Trạng thái:** tạm chọn.

### TC-27 — Token cũ của Python không có `ver` ⇒ coi là 0
- **Bối cảnh:** Theo spec "thiếu = 0". Hệ quả: user nào đã từng bị tăng version (> 0) thì token Python cũ
  không có `ver` sẽ bị từ chối ⇒ phải đăng nhập lại. Đúng ý nghĩa bảo mật.
- **Trạng thái:** đã chốt theo spec.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | Guard kiểm `deleted_at` + `token_version` qua port, cache ≤ 30 s có giới hạn | AUTH-03 |

## Gợi ý review

- TC-22 (từ 006) giờ làm được rẻ: logout `allDevices` chỉ cần tăng `token_version` + `invalidate()`. Có muốn
  bật không?
- Thông báo lỗi `user_inactive` / `token_revoked` có ổn với FE không?
