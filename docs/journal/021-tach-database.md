# 021 — Tách database backend ↔ AI Engine, giao tiếp qua kênh trung gian

> Task: DS-01 · Ngày: 2026-11-20 · Trạng thái: chờ review
>
> Thiết kế đầy đủ: [docs/integration.md](../integration.md). Nhật ký này ghi lý do, những gì đã đổi trong code/tài
> liệu và các điểm còn tranh cãi.

## Tóm tắt dễ hiểu

Hiếu yêu cầu: backend NestJS và AI Engine Python **không dùng chung database nữa**; bên nào cần dữ liệu của bên kia thì
đi qua kênh trung gian (Redis, hàng đợi, API…). Spec ban đầu cho hai bên dùng chung một PostgreSQL, Engine được đọc
bảng của backend tới tận Phase 5.

Giờ mỗi bên có kho riêng, và có ba cách để có dữ liệu của bên kia:
- **hỏi** qua API nội bộ, khi cần câu trả lời ngay;
- **được báo** qua sự kiện Redis Streams, khi chỉ cần bên kia biết rồi tự làm;
- **được đưa kèm** trong request, cho dữ liệu nhỏ phục vụ đúng một lượt chat.

Code backend không cần viết lại nhiều: Phase 1 vốn chỉ đọc ghi bảng của chính mình và báo Engine qua outbox. Phần đổi
chủ yếu là **hợp đồng** (sự kiện, API Engine gọi backend), **bỏ** ba lời gọi HTTP đã thành sự kiện, và một **máy canh**
để không ai lỡ map hay viết SQL vào bảng của Engine.

## Vấn đề cần giải quyết

- Kiểm kê code Python (`80d9bc9b`, đọc code, không chạy) cho thấy Engine đang:
  - đọc thẳng nhiều bảng của backend: lịch sử `messages`, giải mã key trong `model_providers`, `documents` +
    `conversations` nối vào mọi truy vấn RAG (bảng đầy đủ ở [integration.md §8](../integration.md));
  - **ghi** `server_secrets` (tự insert khoá nếu thiếu — `app/core/server_secrets.py:124`).
- Bảng của Engine có **20 FK** trỏ sang bảng backend (đếm từ dump Alembic — danh sách ở
  [database-schema.md](../reference/database-schema.md#fk-chéo-phải-bỏ-khi-tách-db-phía-engine-eng-04)).
- Có 6 transaction ghi cả hai miền cùng lúc, ví dụ INSERT tin nhắn + upsert `conversation_summary_jobs`
  (`app/repositories/conversation_compaction.py:364`).
- Khoá lượt advisory dùng chung giữa MessageService và fork (`app/services/conversation_turn_coordinator.py:206`).
- Phía backend: tài liệu và một ít code còn giả định "DB dùng chung":
  - comment khoá lượt "shared with Python";
  - port Engine có E5/E8/E9 để bộ phát outbox gọi HTTP;
  - mock Engine gọi ngược callback B1.
- Ràng buộc: **không sửa repo chatbot**. Phần Engine phải đổi được viết thành checklist bàn giao.

## Đã giải quyết thế nào

1. Kiểm kê (agent đọc repo chatbot, tôi kiểm lại 5 khẳng định bằng code và đếm lại FK bằng dump): bảng nào Engine
   đọc/ghi, FK chéo, transaction chéo, hạ tầng hàng đợi đang có. Python chỉ có Postgres, Redis (bật AOF; Celery dùng
   Redis làm broker), Qdrant, MinerU — **không có RabbitMQ/Kafka**.
2. Chọn kênh cho từng nhu cầu và viết thành [integration.md](../integration.md):
   - **API:** E-API (backend → Engine) và B-API mới (Engine → backend, chỉ đọc).
   - **Sự kiện:** outbox → relay → Redis Streams → consumer group + inbox.
   - **Key Redis dùng chung** có chủ rõ ràng.
   - **Object storage.**
3. Viết hợp đồng thành code trước (AGENTS luật 4), rồi sửa code theo cho compiler chỉ chỗ.
4. Sửa toàn bộ tài liệu: kiến trúc, schema, hợp đồng Engine, PLAN, AGENTS, README, mock, hướng dẫn thêm module,
   và ghi chú vào các nhật ký cũ.

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Thiết kế | [docs/integration.md](../integration.md) |
| Phong bì sự kiện, tên stream, consumer group | [src/contracts/events/envelope.ts](../../src/contracts/events/envelope.ts) |
| 9 sự kiện backend → Engine | [src/contracts/events/backend-events.ts](../../src/contracts/events/backend-events.ts) |
| 1 sự kiện Engine → backend | [src/contracts/events/engine-events.ts](../../src/contracts/events/engine-events.ts) |
| B-API B2–B4 (Engine → backend) | [src/contracts/backend/internal-api.ts](../../src/contracts/backend/internal-api.ts) |
| E1/E3/E4: `modelRuntime`, `history`; bỏ kiểu E5/E8/B1 | [src/contracts/engine/internal-api.ts](../../src/contracts/engine/internal-api.ts) |
| Outbox có kiểu theo hợp đồng | [src/platform/ports/outbox.port.ts](../../src/platform/ports/outbox.port.ts) |
| Port Engine bỏ `deleteThreads`, `indexDocument`, `deindexDocument` | [src/platform/ports/ai-engine.port.ts](../../src/platform/ports/ai-engine.port.ts), mock, http client |
| Máy canh tách DB | [src/app.entities.spec.ts](../../src/app.entities.spec.ts) |
| Bỏ cấu hình `AI_ENGINE_MOCK_INDEX_DELAY_MS` | `src/platform/config/app-config.ts`, `src/platform/core.module.ts` |

### Code then chốt

Outbox giờ kiểm payload bằng compiler: gõ sai field là không build được.

```ts
// src/platform/ports/outbox.port.ts
export interface OutboxEvent<T extends BackendEventType = BackendEventType> {
  readonly eventType: T;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: BackendEventPayloads[T];   // từ src/contracts/events/backend-events.ts
}
```

E1 không còn `historyHint` "để Phase 5"; thay bằng con trỏ, Engine tự kéo lịch sử qua B2:

```ts
readonly modelRuntime: ModelRuntimeV1;                    // model theo agent + key đã giải mã (C2)
readonly history: { readonly throughSequence: number };   // Engine gọi B2 tới sequence này (C1)
```

Máy canh quét tĩnh `src/` (không import module Nest vào Jest): `@Entity('…')` phải thuộc danh sách bảng backend,
không bảng nào của Engine; không chuỗi SQL `FROM|JOIN|INTO|UPDATE|TABLE <bảng Engine>` ngoài `contracts/`.

### Kết quả chạy thật (2026-11-20)

```text
pnpm verify          26 suite, 216 test xanh (thêm 4 test máy canh); dependency-cruiser: no violations
máy canh, thử cài lỗi: file tạm có `UPDATE user_memories …` + `@Entity('document_chunks')`
                     ⇒ 3 test đỏ (bảng Engine, bảng ngoài danh sách, SQL); xoá file ⇒ xanh lại
FK chéo (dump)       20 dòng, khớp danh sách agent đọc từ model Python
chạy app (mock)      POST /dev/engine/turns với E1 mới (modelRuntime, history, planLifecycle) ⇒ stream V3 bình thường
                     tạo rồi xoá hội thoại ⇒ 200; outbox: conversation.deleted | pending |
                     {"ownerId": "…0001", "threadIds": [], "conversationId": "7bd4673e-…"}
```

Không có thay đổi schema: không migration mới. Chưa chạy hệ thống với Engine thật (chưa có).

## Cách thử

```bash
pnpm verify
# Xem máy canh bắt lỗi: thêm tạm một file trong src/ chứa @Entity('user_memories') rồi
pnpm test:unit src/app.entities.spec.ts   # đỏ; xoá file ⇒ xanh
```

## Giới hạn & việc còn lại

- **Mới là thiết kế + hợp đồng.** Relay lên Redis Streams (BUS-01), consumer + inbox (BUS-02), B-API (INT-01), ETL
  (ETL-01) là task riêng trong PLAN. Sự kiện `project.deleted`, `conversation.deleted`, `conversation.forked` đã được
  ghi vào outbox từ trước, nhưng chưa có ai phát đi.
- Mock Engine không còn giả lập index tài liệu + callback B1. Giả lập lại bằng sự kiện ở BUS-01.
- Hợp đồng sự kiện và B-API là **DRAFT** tới khi phía Engine làm theo (ENG-04). `ModelRuntimeV1` là đề xuất của backend,
  cần khớp với `ModelConfigService` của Python ở ENG-01.
- E7 (sinh task plan) có cần `modelRuntime` không: chưa rõ Python dùng key nào cho việc này — ghi vào ENG-01.
- Artifact spec: ~~version 10 chỉ thêm mục ◇ và gắn nhãn ở 4 chỗ, nội dung cũ giữ nguyên~~ — Hiếu chỉ ra trang vẫn
  còn nhiều chỗ nói DB dùng chung. **Version 11** sửa thẳng nội dung toàn trang (xem v1.1 bên dưới). `route-mapping.md`
  sinh lại từ version 11.
- **Rà lại 2026-11-25 (v1.2).** Ba lượt đọc độc lập: (1) đối chiếu artifact với code Python `80d9bc9b` (repo chatbot
  chưa có commit mới), (2) với hợp đồng/tài liệu trong repo này, (3) giữa các mục của chính artifact. Mỗi phát hiện
  được kiểm lại trên code trước khi sửa. Sai đáng kể nhất:
  - E2 còn ghi "lease reaper; xoá hội thoại" dù TC-71 đã chuyển sang sự kiện ⇒ hợp đồng `StopTurnRequestV1.reason`
    chỉ còn `user_stop`.
  - Sự kiện `conversation.forked` ghi "chép summary của nguồn": Python cố ý **không** dùng summary nguồn (nó có thể
    bao cả phần sau điểm cắt, `conversation_fork_memory.py:3-4`) ⇒ sửa thành tạo job cho con tới
    `forkedThroughSequence`.
  - Thiếu 3 điểm phụ thuộc: C20 tool tìm hội thoại (đọc `messages`/`conversations`, bật mặc định; B2 chưa đủ cho
    `read_past_conversation`), C21 web research ghi `web_image_references`, C22 request builder phía backend đọc
    `user_memories` để chèn system prompt. C5 "tắt mặc định" sai (mặc định bật).
  - Danh sách "Engine thôi ghi" lẫn bảng do code quản lý ghi: code AI/worker chỉ ghi `chat_images`,
    `web_image_references`, `hitl_interrupts`, `documents.status` (+ `server_secrets` khi worker khởi động).
  - Kế hoạch §10 còn canary từng đợt, "quay lại từng nhóm trong vài phút", W2 "chỉ một phía ghi", rollback W4 —
    trái với cutover một lần; khoá lượt "hai bên vẫn loại trừ nhau" sai khi hai DB riêng.
  - Còn khoảng trống chưa có chỗ chứa: cột attempt của `documents` (đưa vào DOC-01), `topConversations` của usage
    (thêm field, phần còn lại ở USG-01), registry MCP mâu thuẫn trong spec (Q13).

## Điểm tranh cãi & quyết định

### TC-65 — Bus sự kiện: Redis Streams hay RabbitMQ
- **Bối cảnh:** Hiếu gợi ý Redis, message queue hoặc API. Python đã có Redis (AOF `everysec`, broker Celery, hàng đợi
  thiết bị), chưa có RabbitMQ.
- **Phương án:**
  - A) Redis Streams: không thêm hạ tầng; consumer group, `XAUTOCLAIM`, `WAITAOF` đủ dùng. Phải tự làm DLQ và cắt stream.
  - B) RabbitMQ: có sẵn DLX, hẹn giờ retry, routing; nhưng thêm một hệ thống phải vận hành ở cả hai bên.
- **Đang chọn:** A. Hợp đồng không phụ thuộc broker, nên đổi sang B chỉ là thay adapter.
- **Trạng thái:** tạm chọn — **chờ Hiếu (Q9)**, trước BUS-01.
- **Nếu đổi ý:** viết adapter RabbitMQ cho port publisher/consumer ở BUS-01/02; tên stream ⇒ exchange/queue.

### TC-66 — Lịch sử chat: kéo, đẩy hay giữ bản sao
- **Bối cảnh:** Engine cần tin nhắn **sau con trỏ memory của chính nó**; backend không biết con trỏ đó. Spec định cho
  P5 đẩy `historyHint` trong E1.
- **Phương án:**
  - A) Engine kéo qua B2: một cách cho cả lượt chat, job tóm tắt, fork.
  - B) Backend đẩy N tin gần nhất trong E1: không đủ khi summary bị tụt lại, và lặp dữ liệu mỗi lượt.
  - C) Engine giữ bản sao `messages` nhờ sự kiện: nhanh, nhưng nhân đôi dữ liệu và phải đồng bộ.
- **Đang chọn:** A. E1 gửi `history.throughSequence` để Engine đọc đúng ảnh chụp lúc bắt đầu lượt.
- **Trạng thái:** tạm chọn.
- **Nếu đổi ý:** B ⇒ thêm `recentMessages` vào E1; C ⇒ thêm event `message.created`.

### TC-67 — Key provider đã giải mã đi sang Engine
- **Bối cảnh:** sau khi tách, Engine không đọc được `model_providers`. Spec P5 cũng định gửi `modelRuntime` đã giải mã.
- **Phương án:**
  - A) Backend giải mã, gửi trong E1/E3/E4 và B4. Engine bỏ Fernet.
  - B) Backend gửi bản mã hoá, Engine giữ `MODEL_ENCRYPTION_KEY` để giải.
- **Đang chọn:** A. Một nơi giữ khoá; bí mật chỉ đi trên mạng nội bộ có TLS, `no-store`, không log.
- **Trạng thái:** tạm chọn — **chờ Hiếu (Q11)**, đây là chính sách bảo mật.
- **Nếu đổi ý:** `ResolvedModelV1.credential` ⇒ `{ apiKeyEncrypted }`; Engine giữ khoá Fernet trong env.

### TC-68 — Cutover dữ liệu một lần
- **Bối cảnh:** DB tách rồi thì hệ Python cũ (còn chạy lượt chat tới khi W4 xong) không đọc được `users`/`messages` mới
  do NestJS ghi.
- **Phương án:**
  - A) Một lần: ETL toàn bộ bảng backend khi W1–W6 xong và Engine sẵn sàng.
  - B) Từng đợt: replication DB backend ⇒ DB cũ cho tới đợt cuối.
- **Đang chọn:** A. B phức tạp và dễ lệch dữ liệu.
- **Trạng thái:** tạm chọn — **chờ Hiếu (Q10)**. Hạn của Q1–Q3 đổi từ "trước cutover W1" thành "trước cutover".
- **Nếu đổi ý:** thêm task replication và kiểm chứng hai chiều; ETL-01 chia theo đợt.

### TC-69 — DB riêng nhưng giữ schema giống Alembic
- **Bối cảnh:** SYNC-01 đã làm tên cột, ràng buộc, default giống hệt DB thật. Tách DB rồi thì việc này không còn bắt buộc.
- **Đang chọn:** giữ nguyên. Lợi ích: ETL chép 1:1 và kiểm được bằng `db:migrate:check`. Dọn di sản (`sender` số, tên
  `feedback_pkey`) để sau cutover.
- **Trạng thái:** tạm chọn.

### TC-70 — Xoá tài liệu: xoá object ngay, không chờ Engine
- **Bối cảnh:** spec cũ: "E9 rồi mới xoá object S3". Với sự kiện, backend không biết lúc nào Engine gỡ index xong.
- **Đang chọn:** xoá object ngay sau commit. Engine đang parse dở thì lỗi đọc file ⇒ bỏ qua vì tài liệu đã xoá.
  Chunk/vector do Engine xoá khi nhận `document.deleted`.
- **Trạng thái:** tạm chọn (áp dụng ở DOC-03).

### TC-71 — Engine tự dừng run khi hội thoại bị xoá
- **Bối cảnh:** bảng outbox cũ: `conversation.deleted` ⇒ "E2 nếu còn lượt, rồi E5".
- **Đang chọn:** chỉ một event; Engine tự dừng run của hội thoại rồi xoá thread. Bớt một lời gọi đồng bộ, và Engine
  biết rõ nhất run nào đang chạy.
- **Trạng thái:** tạm chọn. Liên quan Q5 (có cho xoá khi đang có lượt không).

### TC-72 — Gỡ E5/E8/E9/B1 ngay, chưa có relay
- **Bối cảnh:** chưa có relay (BUS-01) nên chưa ai gọi E5/E8/E9; để lại sẽ có người dùng nhầm.
- **Đang chọn:** gỡ khỏi port, client HTTP, mock và cấu hình. Mất giả lập "index tài liệu + B1" trong mock; nó chưa
  có người dùng, sẽ làm lại bằng sự kiện ở BUS-01.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-20 | Thiết kế tách DB + kênh giao tiếp; hợp đồng sự kiện, B-API; outbox có kiểu; bỏ E5/E8/E9/B1; máy canh; sửa tài liệu và ghi chú vào nhật ký 001, 002, 003, 009, 011, 012, 016, 017, 018 | Hiếu yêu cầu tách database |
| v1.1 | 2026-11-20 | Artifact version 11: sửa thẳng mọi chỗ còn nói DB dùng chung (khoảng 120 chỗ thay ở §0–§13, bảng route, module, bảng DB, sơ đồ §7b; 42 nhãn "Cập nhật 20/11", 4 nhãn "Bỏ 20/11"); ba mục nhật ký ☆ ★ ◆ giữ nguyên vì là lịch sử. Làn DB trong sơ đồ tách thành "DB backend" / "DB Engine" / "DB hiện tại". Bảng route sinh lại (B1 ⇒ B2–B4, cột Internal theo sự kiện). Sửa nhầm mã route xoá tài liệu D5 ⇒ D7 trong integration.md và hợp đồng | Hiếu: "tài liệu vẫn còn chỗ dùng chung database" |
| v1.2 | 2026-11-25 | Rà lại artifact (3 lượt độc lập) ⇒ version 12, ~85 chỗ sửa có nhãn "Cập nhật 25/11"; repo: thu hẹp `StopTurnRequestV1.reason`, ghi chú `attachments.chatImageId`, thêm `topConversations`; sửa Swagger A12 (E5), comment "bảng dùng chung"; integration.md C20–C22, owner của summary, trần backoff; PLAN thêm Q13, ghi chú DOC-01/INT-01/USG-01/ENG-01, số route W1/W2/W6 | Hiếu yêu cầu duyệt lại xem còn chỗ chệch |

## Gợi ý review

- Đọc [integration.md](../integration.md) §4 (chọn kênh) và §6.4 (danh mục sự kiện) trước, rồi tới §12 (Q9–Q13).
- So danh mục sự kiện với các chỗ Python ghi chéo miền (§8) xem còn sót không.
- Xem `ModelRuntimeV1` có đủ cho cách Python chọn model theo agent không (ENG-01).
