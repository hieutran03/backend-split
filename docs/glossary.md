# Thuật ngữ chung

> File này là nơi **duy nhất** định nghĩa thuật ngữ và ký hiệu của dự án. Artifact "Chatbot Backend Split" (mục
> "Thuật ngữ") chép lại đúng nội dung này. Sửa ở đây thì sửa luôn artifact trong cùng lượt.
>
> Kế hoạch: [PLAN.md](PLAN.md) · Kiến trúc code: [architecture.md](architecture.md) · Kênh giữa backend và Engine:
> [integration.md](integration.md).

## Quy ước viết

1. **Viết bằng lời trước.** Mã chỉ để tra bảng và đặt trong ngoặc, ví dụ "xoá hội thoại (A12)". Không viết câu chỉ
   gồm mã, như "A12 vs D24 (TC-33)".
2. **Không đặt họ mã mới.** Cần ký hiệu mới thì thêm vào file này trước, rồi mới dùng.
3. **Mã trùng chữ cái thì ghi kèm loại:** "route D3", "quyết định D19", "rủi ro R25", "giai đoạn P3". Danh sách trùng
   ở [mục cuối](#chữ-cái-bị-trùng).
4. Tên bảng, cột, sự kiện và field JSON giữ nguyên như trong code, đặt trong `code`.

## Các bên

| Thuật ngữ | Nghĩa |
|---|---|
| **Backend** | Dịch vụ NestJS trong repo backend-split: auth, hội thoại, tin nhắn, file, cấu hình, thiết bị… Mọi API public `/api/v1` đi qua đây. |
| **AI Engine** (gọi tắt **Engine**) | Phần AI còn lại ở repo Python `chatbot`: graph LangGraph multi-agent, RAG, tool, worker. Chỉ nhận gọi nội bộ. |
| **Python cũ** / **FastAPI cũ** | Ứng dụng chatbot hiện tại, một tiến trình làm cả hai việc. Là nguồn sự thật về hành vi khi spec im lặng. |
| **FE** | Frontend web và sidecar trên máy user, những bên gọi API public. |
| **Thiết bị** (client device, sidecar) | Ứng dụng trên máy user, chạy tool tại máy, kết nối WebSocket với backend. |
| **DB backend** / **DB Engine** | Hai database PostgreSQL riêng. Không bên nào kết nối DB bên kia ([integration.md](integration.md)). |
| **Hạ tầng dùng chung** | Redis (key có hợp đồng, bus sự kiện) và object storage S3/MinIO. Qdrant thuộc Engine. |

## Nghiệp vụ

| Thuật ngữ | Nghĩa | Trong code / DB |
|---|---|---|
| **Hội thoại** | Một cuộc chat của một user, có thể nằm trong một project. | `conversations` |
| **Tin nhắn** | Một tin trong hội thoại; người gửi là user hoặc assistant; số thứ tự tăng dần trong hội thoại. | `messages`, `sender` (DB: 1/2; API: `user`/`assistant`), `sequence` |
| **Project** | Nhóm hội thoại có hướng dẫn chung (`instructions`) và custom agent riêng. | `projects` |
| **Persona** | Lời dặn vai trò riêng của một hội thoại, gửi kèm mỗi lượt chat. | `persona_prompt` |
| **Fork** | Tạo hội thoại con, chép các tin tới một tin đã chọn. | route A12a |
| **Planning mode**, **kế hoạch công việc** | Chế độ để AI lập và chạy danh sách việc; mỗi việc là một dòng task plan. | `planning_mode_enabled`, `task_plans` |
| **Vòng đời kế hoạch** | Trạng thái kế hoạch của hội thoại: `draft`, `ready`, `executing`, `paused`, `completed`. | `plan_lifecycle` |
| **Feedback** | Đánh giá 1–5 sao cho một tin trả lời; mỗi tin tối đa một feedback. | `feedbacks` |
| **Custom agent** | Agent do user tự định nghĩa (prompt, tool), gắn vào hội thoại hoặc project. | `custom_agents` |
| **Provider**, **key provider** | Nhà cung cấp model (OpenAI…) và API key của user, lưu mã hoá Fernet. | `model_providers` |
| **Cấu hình model theo agent** | Model nào chạy cho agent chat / rag / search / planning. | `agent_model_configs` |
| **MCP server** | Server tool bên ngoài theo giao thức MCP; registry do Engine giữ, backend chỉ chuyển tiếp API quản trị. | route X1–X10 |
| **Tài liệu** (document) | File user tải lên hội thoại; backend lưu file, Engine tách đoạn và đánh chỉ mục để RAG. | `documents` |
| **Widget** | Khung giao diện sống hiển thị trong chat, do tool của MCP server `widgets` tạo. FE kết nối bằng token riêng (5 phút) và WebSocket; trạng thái giữ trong Redis `widget:*`. | route W1r–W3r |

## Lượt chat

| Thuật ngữ | Nghĩa | Trong code / DB |
|---|---|---|
| **Lượt chat** (turn) | Một lần user gửi tin và AI trả lời, từ lúc nhận tin tới sự kiện cuối. | |
| **Generation** | Dòng theo dõi vòng đời một lượt (đang chạy, dừng, xong…), có version để chống ghi đè. | `generations` |
| **Lease** | Hạn giữ lượt: 30 giây, gia hạn mỗi 10 giây; hết hạn thì scheduler kết thúc lượt. | |
| **Khoá lượt** | Khoá theo hội thoại để hai việc ghi (lượt chat, fork) không chạy cùng lúc; chờ quá 30 giây ⇒ 409. | `conversation_turn_conflict` |
| **Stream V3** | Chuỗi sự kiện NDJSON Engine trả về trong một lượt, `seq` tăng từ 1. | `V3StreamEvent` |
| **Sự kiện cuối** (terminal) | Sự kiện duy nhất kết thúc stream: `complete`, `interrupt`, `continuation_available` hoặc `error`. | |
| **HITL**, **interrupt** | Tool cần người duyệt: lượt dừng ở `interrupt`, user duyệt hoặc từ chối rồi chạy tiếp (resume). | `hitl_interrupts`, `tool_approvals` |
| **Dừng** (stop), **chạy tiếp** (continue) | User dừng lượt đang chạy; hoặc cho AI viết tiếp khi lượt dừng vì hết ngân sách. | route A15, A17 |
| **SSE nội bộ**, **AI SDK v6** | Hai định dạng stream backend trả cho FE, chuyển từ stream V3. | |
| **UIMessage** | Định dạng tin nhắn của Vercel AI SDK, trả khi gọi danh sách tin với `format=ui-message`. | |

## API

| Thuật ngữ | Nghĩa |
|---|---|
| **Envelope** | Mọi response JSON có dạng `{ success, code, message, data }`. Lỗi có `data.reason`; lỗi validate có `data.errors[{ field, message }]`. |
| **Phân trang chuẩn** | `?page=1&limit=20&sort=-updatedAt` → `data: { items, meta: { page, limit, total, totalPages } }`. `limit` tối đa 100. |
| **Thứ tự mặc định** | Mỗi danh sách có một thứ tự mặc định (vd. tin nhắn: `-sequence`). `sort` theo trường danh sách đó không cho phép ⇒ dùng thứ tự mặc định, **không báo lỗi**. |
| **Không sở hữu ⇒ 404** | Đọc/sửa dữ liệu của người khác trả 404 như không tồn tại; 403 chỉ dùng cho quyền admin. |
| **Xoá mềm** | Đặt `deleted_at`, không xoá dòng. Dữ liệu đã xoá mềm coi như không tồn tại. |
| **Token cũ** | Access/refresh token JWT do Python cũ phát; backend còn nhận trong thời gian chuyển tiếp. |
| **Refresh token xoay vòng** | Mỗi lần refresh trả vé mới, vé cũ bị thu hồi; dùng lại vé đã thu hồi ⇒ thu hồi cả chuỗi. |
| **Phiên bản token** | Claim `ver` so với `users.token_version`; tăng version ⇒ mọi token cũ hết hiệu lực. |
| **Lớp tương thích** | Giữ đường dẫn route cũ trong lúc FE chuyển sang `/api/v1`. |

## Dữ liệu & tích hợp

| Thuật ngữ | Nghĩa |
|---|---|
| **API Engine** (E1–E21) | API nội bộ `/internal/v1` của Engine, backend gọi: lượt chat (E1), dừng (E2), resume (E3), chạy tiếp (E4)… |
| **API backend cho Engine** (B2–B4) | API nội bộ của backend, Engine gọi để đọc: tin nhắn của một hội thoại (B2), tìm tin trong các hội thoại của user (B3), model + key cho worker ngoài lượt (B4). Chỉ đọc. |
| **Sự kiện** | Thông báo một thay đổi đã xảy ra, gửi qua bus, vd. `conversation.deleted`. Danh mục ở `src/contracts/events`. |
| **Bus** | Redis Streams: backend phát vào `bus:backend:events`, Engine phát vào `bus:engine:events`. |
| **Outbox** | Bảng `outbox_events`: sự kiện được ghi **trong cùng transaction** với thay đổi, nên không mất và không phát khi rollback. |
| **Relay** | Tiến trình đọc outbox rồi đẩy lên bus; giao **ít nhất một lần**. |
| **Inbox** | Bảng bên nhận ghi id sự kiện đã xử lý, để xử lý trùng không gây hại. |
| **Migration** | Thay đổi schema DB backend, **sinh bằng script** từ Record (`pnpm db:migrate:generate`). Alembic là migration phía Python/Engine. |
| **Dữ liệu vàng** (golden) | Đầu vào/đầu ra sinh bằng code Python thật; test NestJS phải khớp. |
| **Mock Engine** | Engine giả trong tiến trình backend, chọn kịch bản bằng marker `[mock:*]` trong tin nhắn ([ai-engine-mock.md](ai-engine-mock.md)). |

## Kiến trúc code

Chi tiết và luật ở [architecture.md](architecture.md). Kiến trúc đã chốt: **clean vừa phải**, mỗi miền một Nest module.

| Thuật ngữ | Nghĩa |
|---|---|
| **Module** (miền, context) | Một thư mục `src/modules/<tên>` (identity, projects, conversations…), tự chứa 4 tầng dưới. |
| **domain** | Quy tắc nghiệp vụ thuần TS, không biết framework hay DB. |
| **application** / **use case** | Một hành động của user (tạo hội thoại, fork…), gọi domain và các port. |
| **Port** | Interface application cần (repository, khoá, outbox…); tầng infrastructure cài đặt. |
| **infrastructure** / **Record** | Code TypeORM, SQL, adapter. Record = class TypeORM map một bảng. |
| **presentation** | Controller và schema zod của request. |
| **public-api.ts** | Thứ duy nhất module khác được import từ một module. |
| **platform** | Phần kỹ thuật dùng chung: config, DB, HTTP, JWT, client Engine. |
| **contracts** | Hợp đồng với Engine (body E1, stream V3, sự kiện, API backend cho Engine): chỉ type và hằng số. |

## Kế hoạch & quy trình

| Thuật ngữ | Nghĩa |
|---|---|
| **Giai đoạn P0–P6** | Các giai đoạn của **toàn dự án tách** (artifact mục 10): chuẩn bị, tách tại chỗ ở Python, API nội bộ Engine, xây NestJS, cutover, siết chặt, theo dõi sau chuyển. |
| **Đợt W1–W6** | Nhóm route chuyển sang NestJS cùng lúc: W1 tài khoản & dữ liệu đọc, W2 cấu hình, W3 tài liệu & media, W4 lượt chat & HITL, W5 thiết bị & widget, W6 vận hành. PLAN chia task theo đợt; đây là phần việc của giai đoạn P3. |
| **Nền tảng** | Task `F-nn`: khung dự án dùng chung cho mọi đợt. |
| **Cutover** | Chuyển production từ Python cũ sang backend + Engine. Đang đề xuất làm **một lần** khi đủ W1–W6 (chờ Hiếu chốt). |
| **ETL** | Script chép dữ liệu 22 bảng backend từ DB cũ sang DB backend lúc cutover, có đếm dòng và checksum. |
| **Staging / shadow** | Chạy thử NestJS song song với Python cũ, so kết quả, trước cutover. |
| **Gate** | Bằng chứng phải có trước mỗi mốc (artifact mục 12). |
| **Mã task** | `TIỀN-TỐ-nn` trong PLAN, vd. `AUTH-01`, `CONV-03`. Tiền tố theo miền: `F` nền tảng, `AUTH`, `CONV`, `MSG`… |
| **Trạng thái task** | `[ ]` chưa làm · `[~]` đang làm · `[r]` xong, chờ Hiếu review · `[x]` đã review · `[!]` bị chặn. |
| **Lượt làm** (iteration) | Nhận một task → code → test → chạy thật → nhật ký → `[r]` → commit. |
| **Nhật ký** | `docs/journal/NNN-*.md`, mỗi chức năng một file ([README](journal/README.md)). |
| **Điểm tranh cãi** (`TC-n`) | Một lựa chọn có nhiều phương án, ghi trong nhật ký: bối cảnh, phương án, đang chọn, trạng thái. Đánh số liên tục toàn dự án. |

## Ký hiệu tra cứu

Các mã dưới đây có sẵn từ tài liệu thiết kế gốc hoặc từ artifact. Giữ để tra bảng, không đặt thêm.

| Ký hiệu | Nghĩa | Tra ở đâu |
|---|---|---|
| A, PJ, P, M, X, D, C, R, W…r, H + số | Mã route public: A chat/hội thoại, PJ project, P provider, M cấu hình model, X MCP, D tài liệu, C thiết bị, R runtime thiết bị, W…r widget, H health/metrics | [route-mapping.md](reference/route-mapping.md), artifact mục 4.2 |
| E1–E21 | API Engine (backend gọi). E5, E8, E9 đã bỏ khi tách DB | [engine-contract.md](reference/engine-contract.md), artifact mục 8 |
| B2–B4 | API backend cho Engine (B1 đã bỏ) | [integration.md](integration.md) mục 5.2 |
| S1–S8 | Quy tắc chung cho mọi route JSON (envelope, phân trang, camelCase…) | artifact mục 4.1 |
| D1–D24 | Quyết định thiết kế gốc, vd. quyết định D19: token cũ đổi một lần trong 7 ngày | artifact mục 11 |
| R1–R29 | Rủi ro | artifact mục 9.2 |
| C1–C22 | Điểm phụ thuộc của code AI vào phần quản lý (đọc/ghi DB, key Redis, import code) | artifact mục 3.1, [integration.md](integration.md) mục 8 |
| M1–M8 | Chỗ code quản lý gọi ngược vào AI | artifact mục 3.2 |
| §n | Mục của artifact, vd. §4.1 | artifact |
| Mã task, `TC-n` | Xem [Kế hoạch & quy trình](#kế-hoạch--quy-trình) | PLAN, nhật ký |

## Chữ cái bị trùng

Những chữ cái dưới đây có hai nghĩa. Luôn ghi kèm loại.

| Viết | Nghĩa | Ví dụ |
|---|---|---|
| route Dn / quyết định Dn | D1–D7 route tài liệu; D1–D24 quyết định thiết kế | "route D3" (xem trạng thái xử lý tài liệu), "quyết định D19" |
| route Pn / giai đoạn Pn | P1–P6 route provider; P0–P6 giai đoạn dự án | "route P5" (kiểm key), "giai đoạn P3" (xây NestJS) |
| route Mn / điểm gọi ngược Mn | M1–M4 route cấu hình model; M1–M8 chỗ code quản lý gọi vào AI | |
| route Cn / điểm phụ thuộc Cn | C1–C6 route thiết bị; C1–C22 điểm phụ thuộc của code AI | |
| route Rn / rủi ro Rn | R1–R2 route runtime thiết bị; R1–R29 rủi ro | "rủi ro R25" (nguồn khoá ký) |
| Sn | S1–S8 quy tắc API (mục 4.1); S1–S9 bước đổi schema (mục 6.3); S0–S9 và S1.1… sơ đồ tuần tự (mục 7b) | "quy tắc S2", "bước S7", "sơ đồ S4.3" |
| Wn / Wnr | W1–W6 đợt; W1r–W3r route widget (có chữ `r`) | |

## Ký hiệu đã bỏ (26/11)

Còn gặp trong nhật ký và commit cũ:

| Ký hiệu cũ | Thay bằng |
|---|---|
| `Phase 0`…`Phase 6` trong PLAN | "Nền tảng" và "đợt W1–W6". Không nhầm với giai đoạn P0–P6 của artifact |
| "đợt M1…M6" trong artifact | đợt W1–W6 |
| `Q1`…`Q13` | Danh sách "Việc cần Hiếu quyết" trong [PLAN](PLAN.md#việc-cần-hiếu-quyết), mỗi việc gọi bằng tên. Bảng đối chiếu ngay dưới |
| `OBX-02` | gộp vào `BUS-01` (relay outbox lên Redis Streams) |

| Mã cũ | Việc | Trạng thái 26/11 |
|---|---|---|
| Q1 | Thời hạn refresh token | chờ Hiếu |
| Q2 | Refresh xoay vòng nghiêm ngặt ⇒ FE phải refresh tuần tự | chờ Hiếu |
| Q3 | Logout mọi thiết bị có vô hiệu luôn access token đang sống | chờ Hiếu |
| Q4 | Client ngắt kết nối có huỷ lượt chat | chờ Hiếu |
| Q5 | Xoá hội thoại khi lượt đang chạy | **chốt:** cho xoá, Engine tự dừng lượt khi nhận `conversation.deleted` |
| Q6 | Một migration viết tay cho index full-text | **chốt:** cho phép, chỉ cho thứ TypeORM không sinh được |
| Q7 | GET trạng thái kế hoạch có ghi DB như Python | **chốt:** giữ như Python |
| Q8 | Kiến trúc clean hay layered | **chốt:** clean vừa phải, như code đang chạy |
| Q9 | Bus sự kiện Redis Streams hay RabbitMQ | chờ Hiếu |
| Q10 | Cutover một lần hay từng đợt | chờ Hiếu |
| Q11 | Gửi key provider đã giải mã sang Engine | chờ Hiếu |
| Q12 | Ai làm phần việc phía Engine | chờ Hiếu |
| Q13 | Registry MCP server ở đâu | **chốt:** Engine giữ (bảng trong DB Engine), backend chỉ chuyển tiếp |
