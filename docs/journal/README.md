# Nhật ký chức năng

Mỗi chức năng làm xong có **một file riêng** ở đây. Mỗi file có 2 lớp:

1. **Phần dễ hiểu** — viết bằng lời thường: chức năng này để làm gì, người dùng thấy gì,
   giải quyết vấn đề gì. Người không đọc code cũng hiểu.
2. **Phần kỹ thuật** — file nào, code chính, request/response thật, cách thử, giới hạn còn lại.

File đặt tên `NNN-ten-chuc-nang.md`, số tăng dần theo thứ tự làm. Task ID khớp với
[PLAN.md](../PLAN.md).

## Danh sách

| # | Chức năng | Task | Ngày | Trạng thái |
|---|---|---|---|---|
| 001 | [Nền tảng & kiến trúc](001-nen-tang-kien-truc.md) | F-01…F-06, F-12 | 2026-11-09 | đã review |
| 002 | [AI Engine giả lập (mock)](002-mock-ai-engine.md) | F-07…F-09, F-11 | 2026-11-09 | đã review |
| 003 | [Quản lý Project](003-projects.md) | F-10 (PJ1–PJ5) | 2026-11-09 | đã review |
| 004 | [Tài liệu API (Swagger)](004-swagger.md) | F-16 | 2026-11-09 | đã review |
| 005 | [Đăng ký & đăng nhập](005-dang-ky-dang-nhap.md) | AUTH-01 (A1, A2) | 2026-11-09 | đã review |
| 006 | [Refresh & logout](006-refresh-logout.md) | AUTH-02 (A3, A4, D19) | 2026-11-09 | đã review |
| 007 | [Guard kiểm phiên bản token](007-guard-token-version.md) | AUTH-03 | 2026-11-09 | đã review |
| 008 | [Hồ sơ của tôi](008-users-me.md) | USR-01 (A5) | 2026-11-09 | đã review |
| 009 | [Migration sinh bằng script](009-migration-sinh-bang-script.md) | F-17 | 2026-11-10 | chờ review |
| 010 | [Hội thoại: tạo/xem/sửa/danh sách](010-hoi-thoai-crud.md) | CONV-01 | 2026-11-10 | chờ review |
| 011 | [Xoá hội thoại](011-xoa-hoi-thoai.md) | CONV-02 (A12, A25) | 2026-11-11 | chờ review |
| 012 | [Đọc tin nhắn](012-doc-tin-nhan.md) | MSG-01 (A10, A19, A20) | 2026-11-11 | chờ review |
| 013 | [Danh sách hội thoại kèm tin nhắn](013-danh-sach-hoi-thoai-kem-tin-nhan.md) | CONV-04 (A9) | 2026-11-11 | chờ review |
| 014 | [Đánh giá câu trả lời](014-feedback.md) | FB-01 (A30, A32–A34) | 2026-11-11 | chờ review |
| 015 | [Gắn hội thoại vào project, xoá project](015-project-va-hoi-thoai.md) | PJ-06, PJ-05 (PJ5–PJ7) | 2026-11-11 | chờ review |

## Điểm tranh cãi

| TC | Câu hỏi | Trạng thái | File |
|---|---|---|---|
| TC-1 | Layered hay clean architecture | tạm chọn, chờ Hiếu | 001 |
| TC-2 | Module mỗi context hay 1 composition root | tạm chọn | 001 |
| TC-3 | zod hay class-validator | tạm chọn | 001 |
| TC-4 | TypeORM có quản schema không | chốt: không | 001 |
| TC-5 | Chấp nhận token cũ không `type` | chốt (D19) | 001 |
| TC-6 | Mock in-process hay HTTP server | tạm chọn in-process | 002 |
| TC-7 | Hợp đồng V3 DRAFT | **mở** | 002 |
| TC-8 | Marker trong tin nhắn hay header | tạm chọn marker | 002 |
| TC-9 | Client ngắt có huỷ lượt (D5) | **mở** | 002 |
| TC-10 | Xoá project có hội thoại | **đóng** — gỡ liên kết (PJ5) | 003 |
| TC-11 | Giới hạn instructions | tạm chọn | 003 |
| TC-12 | Luôn 404 khi không sở hữu | chốt (D15) | 003 |
| TC-13 | Báo Engine khi xoá project | chốt: outbox | 003 |
| TC-14 | Cầu nối zod→OpenAPI tự viết | tạm chọn | 004 |
| TC-15 | Bật Swagger ở môi trường nào | tạm chọn | 004 |
| TC-16 | Response schema lệch dữ liệu thật | tạm chọn | 004 |
| TC-17 | Email phân biệt hoa/thường | **mở** | 005 |
| TC-18 | Mật khẩu ≤ 72 byte | tạm chọn | 005 |
| TC-19 | TTL refresh token 30 ngày | chờ Hiếu | 005 |
| TC-20 | Context `identity` gộp auth + users | tạm chọn | 005 |
| TC-21 | Refresh song song: nghiêm ngặt hay ân hạn | tạm chọn nghiêm ngặt | 006 |
| TC-22 | Logout allDevices vô hiệu access token | chờ Hiếu | 006 |
| TC-23 | Logout vé người khác ⇒ 0 | tạm chọn | 006 |
| TC-24 | Logout cần access token | tạm chọn | 006 |
| TC-25 | Lý do lỗi tách `user_inactive` / `token_revoked` | tạm chọn | 007 |
| TC-26 | Cache trong process hay Redis | tạm chọn process | 007 |
| TC-27 | Token thiếu `ver` = 0 | theo spec | 007 |
| TC-28 | `aggregate_id` varchar | tạm chọn | 009 |
| TC-29 | CHECK fork_request_fields_together | **mở** | 009 |
| TC-30 | Giữ nguyên file migration sinh ra | tạm chọn | 009 |
| TC-31 | Tìm hội thoại: tiêu đề hoặc nội dung tin | tạm chọn | 010, 013 |
| TC-32 | `planningModeEnabled: null` ⇒ 400 | tạm chọn | 010 |
| TC-33 | Lượt active không chặn xoá hội thoại (A12 vs D24) | **chờ Hiếu** | 011 |
| TC-34 | `threadIds` chụp lúc xoá | tạm chọn | 011 |
| TC-35 | messages join thẳng bảng `conversations` | tạm chọn — **Hiếu xem** | 012 |
| TC-36 | Index FTS tin nhắn chưa tạo | **mở** | 012 |
| TC-37 | Trường MessageView so với Python | tạm chọn | 012 |
| TC-38 | `include=feedback` ⇒ 400 tới FB-01 | **đóng** (FB-01) | 012, 014 |
| TC-39 | Phân trang S2, không cursor | theo spec | 012 |
| TC-40 | `messageCount` luôn có | tạm chọn | 013 |
| TC-41 | Tin trong item: mới nhất trước | tạm chọn | 013 |
| TC-42 | CHECK rating 1–5 | tạm chọn | 014 |
| TC-43 | Unique `message_id` không partial | theo spec | 014 |
| TC-44 | Projects ghi `conversations.project_id` | tạm chọn — **Hiếu xem** | 015 |
| TC-45 | Copy custom agent khi gắn ⇒ PJ-08 | hoãn | 015 |
| TC-46 | Gắn/gỡ đổi `updated_at` | tạm chọn | 015 |
| TC-47 | Response PJ6/PJ7 | tạm chọn | 015 |

Số `TC-n` đánh liên tục toàn dự án (không reset theo file) để trích dẫn ngắn gọn.

## Mẫu cho file mới

```markdown
# NNN — <Tên chức năng>

> Task: <ID trong PLAN> · Ngày: <YYYY-MM-DD> · Trạng thái: chờ review / đã review

## Tóm tắt dễ hiểu
<2–5 câu: chức năng này làm gì, ai dùng, khác gì so với trước>

## Vấn đề cần giải quyết
<Vì sao phải làm; ràng buộc từ spec>

## Đã giải quyết thế nào
<Lời thường, có thể dùng ví dụ đời thường>

## Chi tiết kỹ thuật
### File chính
### Code then chốt
### Request / Response mẫu (lấy từ lần chạy thật)

## Cách thử

## Giới hạn & việc còn lại

## Điểm tranh cãi & quyết định
Mỗi điểm một khối, đủ để người đọc hiểu bối cảnh mà không cần mở spec:

### TC-n — <Câu hỏi ngắn>
- **Bối cảnh:** <vì sao phải chọn; spec/Python đang làm gì>
- **Phương án:** A) … B) … (ưu / nhược ngắn gọn)
- **Đang chọn:** <A/B> — <lý do>
- **Trạng thái:** đã chốt (ai, ngày) / tạm chọn, chờ Hiếu chốt / mở
- **Nếu đổi ý:** <phải sửa những gì>

## Lịch sử phiên bản
| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | YYYY-MM-DD | Bản đầu | — |

## Gợi ý review
```

Quy ước:
- Mỗi lần sửa chức năng sau review ⇒ thêm 1 dòng **Lịch sử phiên bản** (v1.1, v2…) và cập nhật
  trạng thái của **TC** liên quan, không xoá nội dung cũ (gạch đi nếu bị thay thế) — để đọc lại vẫn
  thấy vì sao từng đổi ý.
- Điểm tranh cãi chưa chốt cũng được liệt kê ở mục "Câu hỏi / quyết định đang mở" của PLAN, trỏ về `TC-n`.
