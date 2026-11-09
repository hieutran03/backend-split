# CLAUDE.md

@AGENTS.md

Luật nằm ở [AGENTS.md](AGENTS.md); tiến độ ở [docs/PLAN.md](docs/PLAN.md). File này chỉ ghi thứ riêng của Claude Code.

- Commit: **không** thêm `Co-Authored-By` (đã tắt trong `.claude/settings.json`).
- `pnpm dev` đọc `.env` qua `dotenv` trong `src/platform/config/app-config.ts`.
- Trên Git Bash/Windows, `curl -d` với tiếng Việt có dấu bị lỗi mã hoá phía client — dùng `--data-binary @file.json`.
