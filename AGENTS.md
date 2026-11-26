# AGENTS.md — luật chung cho mọi agent và người

1. **Anchor là [docs/PLAN.md](docs/PLAN.md).** Claude làm chính, Hiếu review. Đầu mỗi buổi đọc
   PLAN (+ mục "Ghi chú review"). Bắt đầu/xong task ⇒ sửa trạng thái (`[~]` → `[r]`) trong cùng
   commit. WIP = 1. Chỉ Hiếu chuyển `[r]` → `[x]` (hoặc Claude sau khi đã sửa theo review).
2. **Kiến trúc** ([docs/architecture.md](docs/architecture.md)): `domain/`, `application/` không
   import NestJS/TypeORM/npm hạ tầng; module chỉ dùng `public-api.ts` của module khác;
   side effect chéo miền chỉ qua outbox trong transaction. Máy canh: `pnpm test:architecture`.
   **Backend và AI Engine có database riêng** ([docs/integration.md](docs/integration.md)): không Record/SQL
   nào chạm bảng Engine; cần dữ liệu thì qua API nội bộ, sự kiện Redis Streams hoặc kèm trong request.
3. **`pnpm verify` xanh** trước khi đánh `[r]`/`[x]`. Chưa chạy thì nói chưa chạy.
   Mỗi chức năng xong ⇒ viết/cập nhật **nhật ký** `docs/journal/` (dễ hiểu + kỹ thuật + `TC-n` + lịch sử phiên bản).
4. **Contract trước code**: đổi API/hợp đồng Engine ⇒ sửa `src/contracts/` và `docs/reference/` trước.
5. **Spec là nguồn sự thật**: route theo [route-mapping.md](docs/reference/route-mapping.md), cột theo
   [database-schema.md](docs/reference/database-schema.md). Tên cột snake_case giữ nguyên.
   Không `synchronize`. Không kết nối DB của Engine. Chỗ spec còn giả định "DB dùng chung" thì
   theo [integration.md](docs/integration.md).
6. **Không tự push / tạo PR / deploy.** Commit message không thêm dòng `Co-Authored-By` hay attribution.
7. **Package manager: pnpm.** Không ghi đường dẫn tuyệt đối vào file.
8. **Không bịa** tên file, hàm, kết quả test, hành vi của code Python. Không chắc ⇒ ghi thành điểm tranh cãi
   trong nhật ký; cần Hiếu quyết thì thêm vào mục "Việc cần Hiếu quyết" của PLAN.
9. **Ngôn ngữ:** comment, chuỗi text trong code (message, Swagger summary, tên test), file cấu hình và
   commit message viết **tiếng Anh**. Tài liệu (`docs/`, README, AGENTS, CLAUDE, nhật ký) giữ **tiếng Việt**.
10. **Thuật ngữ:** [docs/glossary.md](docs/glossary.md) là nơi duy nhất định nghĩa thuật ngữ và ký hiệu; artifact
    chép lại, sửa một bên thì sửa cả hai. Viết bằng lời trước, mã để trong ngoặc; không đặt họ mã mới.
    Artifact và tài liệu repo không được nói khác nhau: thấy lệch thì sửa cho khớp, ghi vào PLAN.
