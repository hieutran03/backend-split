# 005 — Đăng ký & đăng nhập

> Task: AUTH-01 (route A1, A2) · Ngày: 2026-11-09 · Trạng thái: đã review (2026-11-10)

## Tóm tắt dễ hiểu

Người dùng giờ có thể **tạo tài khoản** (tên đăng nhập, email, mật khẩu) và **đăng nhập** để nhận
"vé vào cửa" dùng cho mọi API khác.

Khi đăng nhập thành công, hệ thống trả về hai thứ:

- **Access token** — vé ngắn hạn (15 phút), gửi kèm mỗi request.
- **Refresh token** — vé dài hạn (30 ngày) dùng để xin access token mới mà không phải nhập lại mật
  khẩu. Đây là một chuỗi ngẫu nhiên; hệ thống chỉ cất "dấu vân tay" (SHA-256) của nó, nên dù ai đó
  đọc được database cũng không dùng được vé.

Mật khẩu được băm bằng **bcrypt** đúng kiểu hệ thống Python đang dùng, nên **tài khoản cũ đăng nhập
được ngay** trên backend mới, không cần đặt lại mật khẩu.

Đăng nhập sai — dù sai email hay sai mật khẩu — luôn nhận **cùng một thông báo** và **cùng độ trễ**,
để kẻ xấu không dò được email nào đã đăng ký.

## Vấn đề cần giải quyết

- Spec A1: trùng email/username trả **409** (Python cũ trả 422 `EMAIL_NOT_AVAILABLE`), user có thêm `role`.
- Spec A2: `refreshToken` là **opaque** (lưu hash trong bảng mới `refresh_tokens`), `expiresIn` = 900
  (Python cũ 36000), sai thông tin trả **401** có `code`.
- §11: Python băm bằng `bcrypt.hashpw` cost 12, prefix `$2b$` ⇒ phải đọc được hash cũ.
- Giữ tên trường response như Python (`UserRead`, `TokenResponse`) để FE đổi ít nhất.

## Đã giải quyết thế nào

- Tạo context **identity** gom user + refresh token (auth và users/me dùng chung model User).
- Kiểm trùng **hai lớp**: hỏi DB trước để báo rõ field nào trùng, và dựa vào unique index của DB để chặn
  hai request đăng ký trùng chạy cùng lúc.
- Luật mật khẩu khi đăng ký: ≥ 8 ký tự và ≤ **72 byte** (bcrypt bỏ qua phần sau byte 72).
- Khi email không tồn tại, vẫn chạy một lần so khớp bcrypt giả để thời gian phản hồi giống hệt sai mật khẩu.
- Phát hành refresh token ngay khi đăng nhập. Xoay vòng/thu hồi là lượt sau (AUTH-02).

## Chi tiết kỹ thuật

### File chính

```text
src/modules/identity/
  domain/user.ts                      User aggregate (username 3–50, email ≤255, role, tokenVersion)
  domain/password-policy.ts           ≥8 ký tự, ≤72 byte UTF-8
  application/ports.ts                UserRepository, PasswordHasher, AccessTokenIssuer, RefreshTokenStore
  application/auth.use-cases.ts       SignupUseCase, LoginUseCase
  application/views.ts                UserView (≈ UserRead), TokenView (≈ TokenResponse)
  infrastructure/records.ts           bảng users, refresh_tokens
  infrastructure/typeorm-user.repository.ts   map lỗi unique 23505 ⇒ 409
  infrastructure/bcrypt-password.hasher.ts    bcrypt native, burnTime
  infrastructure/typeorm-refresh-token.store.ts  32 byte random, lưu SHA-256
  infrastructure/jwt-access-token.issuer.ts
  presentation/auth.controller.ts     POST /auth/signup, /auth/login (@Public)
  identity.module.ts
```

Cấu hình mới: `JWT_REFRESH_TTL_SECONDS` (mặc định 30 ngày), `BCRYPT_COST` (mặc định 12).
Seed dev giờ có mật khẩu thật: `dev@example.local` / `other@example.local`, mật khẩu ở
`scripts/dev-users.ts`.

### Code then chốt

Đăng nhập — mọi nhánh thất bại cùng một lỗi, email lạ vẫn tốn thời gian băm:

```ts
const user = await this.users.findActiveByEmail(input.email.trim());
if (!user) {
  await this.hasher.burnTime(input.password);
  throw invalidCredentials();                 // 401 invalid_credentials
}
if (!(await this.hasher.verify(input.password, user.passwordHash))) {
  throw invalidCredentials();
}
```

Refresh token opaque — client nhận chuỗi thật, DB chỉ giữ hash:

```ts
const token = randomBytes(32).toString('base64url');
await this.db.manager.insert(RefreshTokenRecord, {
  tokenHash: createHash('sha256').update(token).digest('hex'), ...
});
return { token, expiresAt };
```

Race khi hai người đăng ký cùng email một lúc — unique index của DB là chốt cuối:

```ts
if (driver.code === '23505')  // ix_users_email | ix_users_username
  throw new ConflictError(message, 'email_not_available' | 'username_not_available');
```

### Request / Response mẫu (chạy thật 2026-11-09, Postgres local)

Đăng ký — 201:

```http
POST /api/v1/auth/signup
{"username":"user1794211499","email":"user1794211499@example.com","password":"mật-khẩu-123"}
```
```json
{"success":true,"code":"ok","message":"Signup successfully","data":{
  "id":"aa126663-e1f9-400b-b4f3-0b8f44864fc0","username":"user1794211499",
  "email":"user1794211499@example.com","avatarUrl":null,"role":"user",
  "createdAt":"2026-11-09T08:04:59.344Z","updatedAt":"2026-11-09T08:04:59.344Z","deletedAt":null}}
```

Trùng — 409:

```json
{"success":false,"code":"conflict","message":"Email is already registered","data":{"reason":"email_not_available"}}
{"success":false,"code":"conflict","message":"Username is already taken","data":{"reason":"username_not_available"}}
```

Sai dữ liệu — 400, báo đủ từng field:

```json
{"success":false,"code":"bad_request","message":"Validation failed","data":{"errors":[
  {"field":"username","message":"Too small: expected string to have >=3 characters"},
  {"field":"email","message":"Invalid email address"},
  {"field":"password","message":"Too small: expected string to have >=8 characters"}]}}
```

Mật khẩu 25 ký tự "ệ" (= 75 byte) — 400:

```json
{"success":false,"code":"bad_request","message":"Validation failed",
 "data":{"errors":[{"field":"password","message":"must be at most 72 bytes (UTF-8)"}]}}
```

Đăng nhập — 200:

```json
{"success":true,"code":"ok","message":"Login successfully","data":{
  "accessToken":"eyJhbGciOiJIUzI1NiIs…","refreshToken":"yjzVY7MnxS…(43 ký tự)",
  "tokenType":"bearer","expiresIn":900,"userId":"aa126663-…"}}
```

Payload của access token: `{"sub":"aa126663-…","ver":0,"type":"access","iat":…,"exp":…}` — `exp − iat = 900`.

Sai mật khẩu **và** email không tồn tại — giống hệt nhau, 401:

```json
{"success":false,"code":"unauthorized","message":"Invalid email or password","data":{"reason":"invalid_credentials"}}
```

Access token vừa nhận dùng được ngay: `GET /api/v1/projects` ⇒ 200.

Trong DB sau khi đăng nhập:

```text
    username    | hash_prefix | token_hash_len | user_agent  |   ttl
----------------+-------------+----------------+-------------+---------
 user1794211499 | $2b$12$     |             64 | curl/8.23.0 | 30 days
```

### Test

13 test mới (tổng 33): đăng ký thành công không lộ hash; trùng email/username ⇒ 409; email của user đã
xoá vẫn tính là trùng; mật khẩu > 72 byte và < 8 ký tự ⇒ 400; đăng nhập trả đúng `TokenView`; email có
khoảng trắng vẫn đăng nhập được; 3 kiểu thất bại cùng một lỗi và không phát refresh token; email lạ có
gọi `burnTime`; bcrypt sinh `$2b$`, đọc được `$2b$12$`, hash hỏng ⇒ false chứ không 500.

## Cách thử

Swagger `/docs` → nhóm **auth** → `POST /auth/login` với `dev@example.local` + mật khẩu trong
`scripts/dev-users.ts` → copy `accessToken` → *Authorize*.

## Giới hạn & việc còn lại

- **Chưa thử với hash thật từ DB Python** — máy không có thư viện bcrypt của Python. Test hiện chứng minh
  đọc được định dạng `$2b$12$` do Node sinh; cần một row thật của bảng `users` để chắc chắn (giống
  cách làm với Fernet ở CRY-01).
- Nhánh race (hai request đăng ký trùng song song ⇒ lỗi 23505 ⇒ 409) mới test bằng fake, chưa test
  trên Postgres thật — đưa vào integration test ở F-14.
- Chưa có giới hạn số lần đăng nhập sai (rate limit / khoá tạm) — spec không yêu cầu, ghi nhận để bàn.
- Refresh/logout (A3, A4) là AUTH-02; kiểm `ver` + user đã xoá trong guard là AUTH-03.
- Cột `users.role` có trong DB local, nhưng DB thật chỉ có sau migration Alembic S1 (P1).

## Điểm tranh cãi & quyết định

### TC-17 — Email có phân biệt hoa/thường không?
- **Bối cảnh:** Unique index `ix_users_email` của DB phân biệt hoa/thường. Chưa đọc được Python có hạ
  chữ thường khi lưu hay không. Nếu backend mới tự hạ chữ thường, người đã đăng ký `Hieu@X.com` trên
  Python sẽ **không đăng nhập được** nữa.
- **Phương án:** A) giữ nguyên, chỉ trim · B) hạ chữ thường khi lưu và khi tra · C) tra không phân biệt
  (`lower(email) = lower(:email)`) nhưng lưu nguyên.
- **Đang chọn:** A — an toàn với dữ liệu cũ.
- **Trạng thái:** **mở** — cần xem Python và thống kê DB thật có email trùng khi hạ chữ thường không.
- **Nếu đổi sang C:** sửa `findActiveByEmail`/`emailExists` + thêm index `lower(email)` (expand).

### TC-18 — Giới hạn mật khẩu 72 byte
- **Bối cảnh:** bcrypt chỉ dùng 72 byte đầu. Tiếng Việt có dấu tốn 2–3 byte/ký tự ⇒ ~25–36 ký tự đã chạm ngưỡng.
- **Phương án:** A) chặn > 72 byte khi đăng ký · B) im lặng như bcrypt · C) băm trước bằng SHA-256 rồi bcrypt
  (không giới hạn, nhưng **không tương thích** hash Python).
- **Đang chọn:** A — rõ ràng với người dùng, giữ tương thích. Chỉ áp khi đăng ký, đăng nhập không áp.
- **Trạng thái:** tạm chọn.

### TC-19 — Thời hạn refresh token
- **Bối cảnh:** Spec không nói TTL. Python cũ: refresh là JWT, chưa đọc được hạn.
- **Đang chọn:** 30 ngày, cấu hình qua `JWT_REFRESH_TTL_SECONDS`.
- **Trạng thái:** tạm chọn — cần Hiếu chốt theo chính sách sản phẩm.

### TC-20 — Gộp auth + users thành một context `identity`?
- **Bối cảnh:** Spec §5 tách module `auth` và `users`. Nhưng cả hai đều đọc/ghi bảng `users`, cùng model User.
- **Phương án:** A) hai module như spec — phải chia sẻ entity hoặc gọi chéo qua port · B) **một context `identity`**
  với hai controller.
- **Đang chọn:** B.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | A1 signup, A2 login, refresh token opaque (phát hành), seed có mật khẩu thật | AUTH-01 |

## Gợi ý review

- TC-17 (email hoa/thường) và TC-19 (TTL refresh) cần bạn quyết.
- Thông báo lỗi/`reason` có hợp với FE không (`email_not_available`, `invalid_credentials`)?
