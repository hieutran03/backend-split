# Chatbot Backend (NestJS)

Phần quản lý & lưu trữ của chatbot, tách khỏi FastAPI + LangGraph: auth, ownership, CRUD,
điều phối lượt chat, file/media, WebSocket thiết bị. Phần AI ở lại **AI Engine** (Python),
gọi qua `/internal/v1`. Khi chưa có Engine, dùng **mock** trong tiến trình.

- Kế hoạch & tiến độ: **[docs/PLAN.md](docs/PLAN.md)** ← đọc trước
- Kiến trúc: [docs/architecture.md](docs/architecture.md)
- Thêm module: [docs/how-to-add-a-module.md](docs/how-to-add-a-module.md)
- Mock AI: [docs/ai-engine-mock.md](docs/ai-engine-mock.md)
- Tra cứu spec: [docs/reference/](docs/reference/)

## Chạy

Yêu cầu: Node ≥ 22, pnpm ≥ 10, Docker.

```bash
pnpm install
cp .env.example .env
pnpm docker:up          # postgres, redis, minio
pnpm db:migrate         # baseline cho DB local trống
pnpm db:seed            # 2 user dev
pnpm dev                # http://localhost:3000/api/v1
pnpm -s token:dev       # access token cho user dev
```

```bash
T=$(pnpm -s token:dev)
curl -s localhost:3000/api/v1/projects -H "authorization: Bearer $T"
curl -s -X POST localhost:3000/api/v1/projects -H "authorization: Bearer $T" \
  -H 'content-type: application/json' -d '{"name":"Demo"}'
```

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm verify` | typecheck + lint + unit + architecture + build — phải xanh trước khi đóng task |
| `pnpm test:unit` | jest |
| `pnpm test:architecture` | luật phụ thuộc (dependency-cruiser) |
| `pnpm db:migrate` / `db:migrate:revert` | migration (bảng `backend_migrations`) |
