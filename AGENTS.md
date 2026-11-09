# AGENTS.md — luật chung cho mọi agent và người

1. **Anchor là [docs/PLAN.md](docs/PLAN.md).** Đầu mỗi buổi: `git pull`, đọc PLAN. Bắt đầu/xong
   task ⇒ sửa trạng thái trong PLAN trong cùng commit. WIP = 1 task `[~]` mỗi người.
2. **Kiến trúc** ([docs/architecture.md](docs/architecture.md)): `domain/`, `application/` không
   import NestJS/TypeORM/npm hạ tầng; module chỉ dùng `public-api.ts` của module khác;
   side effect chéo miền chỉ qua outbox trong transaction. Máy canh: `pnpm test:architecture`.
3. **`pnpm verify` xanh** trước khi đánh `[x]`. Chưa chạy thì nói chưa chạy.
4. **Contract trước code**: đổi API/hợp đồng Engine ⇒ sửa `src/contracts/` và `docs/reference/` trước.
5. **Spec là nguồn sự thật**: route theo [route-mapping.md](docs/reference/route-mapping.md), cột theo
   [database-schema.md](docs/reference/database-schema.md). Tên cột snake_case giữ nguyên.
   Không `synchronize`. Không ghi bảng Engine sở hữu.
6. **Không tự push / tạo PR / deploy.** Commit message không thêm dòng `Co-Authored-By` hay attribution.
7. **Package manager: pnpm.** Không ghi đường dẫn tuyệt đối vào file.
8. **Không bịa** tên file, hàm, kết quả test, hành vi của code Python. Không chắc ⇒ ghi vào
   "Câu hỏi đang mở" trong PLAN.
