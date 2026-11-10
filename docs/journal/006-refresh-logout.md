# 006 — Làm mới phiên (refresh) & đăng xuất (logout)

> Task: AUTH-02 (route A3, A4) · Ngày: 2026-11-09 · Trạng thái: đã review (2026-11-10)

## Tóm tắt dễ hiểu

**Refresh** — Access token chỉ sống 15 phút. Khi hết, ứng dụng dùng refresh token để xin cặp vé mới
mà không bắt người dùng đăng nhập lại. Mỗi refresh token chỉ dùng được **một lần**: dùng xong nó bị
huỷ và người dùng nhận một refresh token mới (gọi là *xoay vòng*).

Vì sao phải xoay vòng? Nếu kẻ xấu lấy trộm được một refresh token cũ và đem ra dùng, hệ thống thấy
"vé này đã dùng rồi" ⇒ hiểu là có sao chép ⇒ **huỷ luôn cả chuỗi vé** sinh ra từ nó. Cả kẻ trộm lẫn chủ
thật đều bị đá ra; chủ thật đăng nhập lại là xong, còn kẻ trộm mất quyền.

**Logout** — Trước đây đăng xuất chỉ "báo đã nhận", vé vẫn dùng được. Giờ đăng xuất **huỷ thật**:
huỷ một vé (thiết bị hiện tại) hoặc huỷ tất cả (đăng xuất mọi thiết bị).

**Chuyển tiếp từ hệ thống cũ** — Người đang đăng nhập trên hệ thống Python giữ một refresh token kiểu
cũ (JWT). Trong 7 ngày sau ngày chuyển (W1), vé cũ được **đổi một lần** lấy vé mới, nên người dùng
không bị đá ra đột ngột. Đổi lần thứ hai bị coi là sao chép.

## Vấn đề cần giải quyết

- A3: refresh token gửi trong **body** (Python đọc từ header Bearer); trả cặp mới; vé cũ bị thu hồi;
  dùng lại vé đã thu hồi ⇒ thu hồi cả "họ" vé.
- A4: `{ refreshToken }` thu hồi vé đó; `{ allDevices: true }` thu hồi mọi vé của user.
- D19: refresh JWT cũ đổi được **một lần** trong **7 ngày**; client (sidecar) phải refresh **tuần tự**,
  nếu không sẽ tự thu hồi chuỗi của mình (spec §4.4).
- Không thêm cột mới vào `refresh_tokens` (bảng mới nhưng schema đã chốt ở §6.3 S2).

## Đã giải quyết thế nào

- Mỗi refresh token là một dòng trong `refresh_tokens`. Xoay vòng = đánh dấu dòng cũ đã thu hồi và trỏ
  `replaced_by_id` tới dòng mới ⇒ các dòng nối thành **chuỗi**.
- Phát hiện dùng lại: vé đưa lên đã bị thu hồi ⇒ đi theo `replaced_by_id` tới cuối chuỗi, thu hồi hết.
  Phần thu hồi này **phải được lưu** trước khi trả lỗi 401 (nếu ném lỗi trong transaction thì việc thu hồi
  bị rollback và kẻ trộm vẫn giữ được chuỗi).
- Hai request refresh cùng một vé đến đồng thời: khoá dòng (`SELECT … FOR UPDATE`) ⇒ chỉ một request
  thắng, các request sau thấy vé đã thu hồi ⇒ coi là dùng lại.
- Đổi JWT cũ: không cần cột mới — sau khi đổi, ghi thêm một dòng "đánh dấu" chứa SHA-256 của JWT đó,
  sinh ra đã ở trạng thái thu hồi và trỏ tới vé mới. Đưa JWT đó lên lần nữa ⇒ rơi vào đúng đường "dùng lại".
- Cửa sổ 7 ngày cấu hình bằng `JWT_LEGACY_REFRESH_UNTIL`; **không đặt = tắt** (an toàn mặc định).

## Chi tiết kỹ thuật

### File chính

```text
src/modules/identity/
  domain/refresh-token.ts               vòng đời: issue, rotate (dùng 1 lần), isExpired, legacyExchangeMarker
  application/ports.ts                  + RefreshTokenRepository, OpaqueTokenGenerator, LegacyRefreshTokenVerifier
  application/refresh-token.issuer.ts   phát hành + lưu 1 refresh token (dùng chung login/refresh/đổi JWT cũ)
  application/session.use-cases.ts      RefreshUseCase (A3 + D19), LogoutUseCase (A4)
  infrastructure/typeorm-refresh-token.repository.ts   khoá dòng, CTE đệ quy thu hồi chuỗi
  infrastructure/token-adapters.ts      sinh token 32 byte + SHA-256; adapter xác thực JWT cũ
  presentation/auth.controller.ts       POST /auth/refresh (@Public), POST /auth/logout (cần access token)
src/platform/auth/jwt-token.service.ts  + verifyLegacyRefresh (HS256, type=refresh, ver)
```

Bỏ: `infrastructure/typeorm-refresh-token.store.ts` (thay bằng repository + issuer).
Cấu hình mới: `JWT_LEGACY_REFRESH_UNTIL` (ISO datetime, để trống = tắt).

### Code then chốt

Thu hồi được **trả về** từ transaction rồi mới ném lỗi — để việc thu hồi được commit:

```ts
const outcome = await this.transactions.run(() =>
  looksLikeJwt(input.refreshToken) ? this.exchangeLegacy(input, now) : this.rotate(input, now),
);
if (outcome.kind === 'rejected') throw outcome.error;   // sau khi commit
```

```ts
// rotate(): vé đã thu hồi ⇒ dùng lại
if (current.isRevoked) {
  await this.tokens.revokeChainFrom(current.id, now);
  return rejected('Refresh token was already used', 'refresh_token_reused');
}
```

Thu hồi cả chuỗi trong một câu SQL:

```sql
WITH RECURSIVE chain AS (
  SELECT id, replaced_by_id FROM refresh_tokens WHERE id = $1
  UNION
  SELECT r.id, r.replaced_by_id FROM refresh_tokens r JOIN chain c ON r.id = c.replaced_by_id
)
UPDATE refresh_tokens SET revoked_at = $2
 WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL
RETURNING id
```

### Request / Response mẫu (chạy thật 2026-11-09, Postgres local)

```http
POST /api/v1/auth/refresh
{"refreshToken":"mMVgV4WXCC…(43 ký tự)"}
```
```json
{"success":true,"code":"ok","message":"Refresh successfully","data":{
  "accessToken":"eyJhbGciOiJIUzI1NiIs…","refreshToken":"<token mới>","tokenType":"bearer",
  "expiresIn":900,"userId":"00000000-0000-4000-8000-000000000001"}}
```

Dùng lại vé đã xoay:

```json
{"success":false,"code":"unauthorized","message":"Refresh token was already used","data":{"reason":"refresh_token_reused"}}
```

```http
POST /api/v1/auth/logout
Authorization: Bearer <access token>
{"allDevices":true}
```
```json
{"success":true,"code":"ok","message":"Logout successfully","data":{"revokedCount":2}}
```

18 kịch bản chạy thật:

| # | Kịch bản | Kết quả |
|---|---|---|
| 1–3 | login → refresh R1 → refresh R2 | OK, OK |
| 4 | dùng lại R1 (giả lập bị trộm) | 401 `refresh_token_reused` |
| 5 | R3 (vé hiện tại của chủ thật) sau đó | 401 `refresh_token_reused` — cả chuỗi đã chết |
| 6 | vé không tồn tại | 401 `invalid_refresh_token` |
| 7 | body rỗng | 400 |
| 8 | logout không có access token | 401 `missing_token` |
| 9–10 | logout bằng vé của người khác | `revokedCount: 0`, vé người kia vẫn dùng được |
| 11–12 | logout R4 rồi refresh R4 | `revokedCount: 1`, sau đó 401 |
| 13 | logout không có trường nào | 400 |
| 14–15 | logout `allDevices` rồi refresh vé khác cùng user | `revokedCount: 2`, sau đó 401 |
| 16 | đổi refresh JWT cũ của Python (ký bằng `JWT_SECRET`, `type=refresh`) | OK — nhận vé opaque mới |
| 17 | đổi cùng JWT lần hai | 401 `refresh_token_reused` |
| 18 | vé nhận được ở bước 16 | 401 — thu hồi theo chuỗi |

Trong DB, chuỗi R1 → R2 → R3 sau khi R1 bị dùng lại:

```text
1243b3f5 | revoked | be1fb142     (R2 → R3)
e64b4752 | revoked | 1243b3f5     (R1 → R2)
be1fb142 | revoked | -            (R3, bị thu hồi theo chuỗi)
e6664dd5 | revoked | 8628d516 | legacy-jwt-exchange   (dòng đánh dấu JWT cũ)
```

Đồng thời — 5 request refresh **cùng một vé** gửi song song, lặp 3 lần:

```text
run 1: 1 OK  4 refresh_token_reused
run 2: 1 OK  4 refresh_token_reused
run 3: 1 OK  4 refresh_token_reused
```

Không lần nào có 2 request cùng thành công; log server không có lỗi.

### Test

21 test mới (tổng 58): xoay vòng trỏ đúng successor; dùng lại ⇒ cả chuỗi chết **và đã được lưu**; vé lạ,
hết hạn, user đã xoá; cửa sổ JWT cũ chưa cấu hình / đã đóng; đổi JWT cũ một lần, lần hai bị coi là dùng lại
và kéo theo vé vừa đổi; sai `ver`; logout một vé / vé của người khác / mọi thiết bị / thiếu trường;
`verifyLegacyRefresh` nhận `type=refresh`, từ chối access token, token không `type`, token hết hạn;
domain: hết hạn đúng thời điểm, `rotate` chỉ một lần, cắt user-agent dài.

## Cách thử

Swagger `/docs` → **auth** → `login` → copy `refreshToken` → `POST /auth/refresh` → thử gửi lại vé cũ.
Logout cần bấm *Authorize* bằng `accessToken` trước.

Thử đổi JWT cũ: đặt `JWT_LEGACY_REFRESH_UNTIL` (vd. `2030-01-01T00:00:00Z`) trong `.env`, tự ký một JWT
`{sub, type:"refresh", ver:0}` bằng `JWT_SECRET`.

## Giới hạn & việc còn lại

- Access token đã phát vẫn sống tới khi hết hạn (≤ 15 phút) sau logout — xem TC-22.
- Chưa kiểm claim `ver` / user đã xoá trong guard access (AUTH-03).
- Chưa có job dọn dòng `refresh_tokens` đã hết hạn / thu hồi lâu — bảng sẽ lớn dần (ghi vào SCH-01).
- Payload thật của refresh JWT Python (tên claim, thời hạn) **chưa đối chiếu với code Python** — đang theo
  spec: HS256, `type=refresh`, `ver`. Cần một token thật để test (giống TC-7).
- Route cũ đọc refresh token từ header Bearer — thuộc lớp tương thích LEG-01.

## Điểm tranh cãi & quyết định

### TC-21 — Hai lần refresh song song cùng một vé có nên được tha?
- **Bối cảnh:** App mở nhiều tab hoặc mạng chập chờn có thể gửi trùng một request refresh. Theo luật "dùng
  lại ⇒ huỷ cả chuỗi", request thứ hai sẽ huỷ luôn vé request thứ nhất vừa nhận ⇒ người dùng bị đá ra.
- **Phương án:**
  - A) **Nghiêm ngặt** — đúng spec §4.4 ("client phải single-flight, nếu không tự thu hồi chuỗi").
  - B) Ân hạn vài giây — vé vừa xoay vẫn được dùng lại trong N giây và trả lại *cùng* vé mới; an toàn kém
    hơn, phải lưu thêm thông tin (vé mới dạng thô không lưu được ⇒ cần thiết kế thêm).
- **Đang chọn:** A — đúng spec, đơn giản, an toàn nhất. Đã đo: 5 request song song ⇒ 1 thành công, 4 bị chặn.
- **Trạng thái:** tạm chọn — **FE/sidecar phải xếp hàng các lần refresh** (một lần tại một thời điểm).
- **Nếu đổi sang B:** thêm cột (vd. `rotated_at`) + lưu bản mã hoá của vé kế tiếp — cần migration expand.

### TC-22 — Logout có huỷ luôn access token đang sống không?
- **Bối cảnh:** Access token là JWT tự kiểm, không tra DB ⇒ logout chỉ huỷ được refresh token. Access token
  còn dùng được tối đa 15 phút.
- **Phương án:** A) chấp nhận ≤ 15 phút · B) `allDevices` tăng `users.token_version` ⇒ mọi access token cũ
  chết ngay (cần guard kiểm `ver` — AUTH-03).
- **Đang chọn:** A cho bản này; đề xuất làm B cùng AUTH-03.
- **Trạng thái:** chờ Hiếu chốt.

### TC-23 — Logout bằng vé của người khác trả gì?
- **Đang chọn:** 200 `revokedCount: 0`, không báo lỗi — không cho dò vé nào hợp lệ; vé của người kia không bị đụng.
- **Trạng thái:** tạm chọn.

### TC-24 — Logout cần access token hay chỉ refresh token?
- **Bối cảnh:** Spec không nói rõ. Cần biết "ai" để làm `allDevices` và để không cho người lạ huỷ vé người khác.
- **Đang chọn:** cần access token (Bearer). Nếu access hết hạn, client refresh trước rồi logout.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-09 | A3 refresh xoay vòng + phát hiện dùng lại, A4 logout thu hồi thật, D19 đổi refresh JWT cũ một lần | AUTH-02 |

## Gợi ý review

- TC-21: FE/sidecar có chắc gửi refresh tuần tự được không? Nếu không, cần làm phương án ân hạn.
- TC-22: có muốn `allDevices` vô hiệu luôn access token (làm cùng AUTH-03) không?
