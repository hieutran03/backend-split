# 019 — Đối chiếu hành vi Phase 1 với code Python

> Task: SYNC-02, TP-02 · Ngày: 2026-11-18 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Nhiều chỗ ở Phase 1 trước đây phải **đoán** cách Python làm (ghi thành `TC-n`, "tạm chọn"). Giờ đã đọc được
code Python, tôi đi lại từng điểm: chỗ nào đoán đúng thì đóng; chỗ nào đoán sai mà **ảnh hưởng tới dữ liệu
dùng chung hoặc FE** thì sửa code cho giống Python; chỗ nào NestJS cố ý khác (do spec quyết) thì giữ và ghi rõ.

Thay đổi người dùng/FE thấy được:

- **Kế hoạch công việc** giờ cập nhật trạng thái kế hoạch của hội thoại (`plan_lifecycle`) như Python — Engine
  đọc cột này để biết kế hoạch đang nháp, đang chạy hay đã xong (TP-02). Việc đầu tiên đánh số **0** (trước: 1).
- **Fork**: tiêu đề mặc định là `"<tiêu đề gốc> (fork)"`; tin nhắn copy giữ nguyên số thứ tự gốc; mã băm
  chống gửi trùng tính **đúng công thức Python**, nên gửi lại một yêu cầu fork mà Python đã tạo vẫn nhận ra.
- **Danh sách hội thoại**: tin xem trước (`include=messages`) trả **cũ → mới**; khi tìm kiếm, kết quả xếp theo
  độ liên quan (khớp nguyên tiêu đề lên đầu).
- **Email**: phần tên miền được hạ chữ thường khi đăng ký **và** đăng nhập, như Python lưu.

## Vấn đề cần giải quyết

- TP-02 bị chặn vì chưa có quy tắc tính `plan_lifecycle` (TC-48).
- Các TC "tạm chọn — cần code Python": TC-17, 31, 40, 41, 46, 49–58.
- Một agent đọc code Python trả lời từng TC kèm `file:line`; các điểm dẫn tới **sửa code** tôi đọc lại tận mắt
  trước khi sửa (fingerprint, tiêu đề mặc định, copy tin, lifecycle, `task_order`, thứ tự preview, tìm kiếm, email).

## Đã giải quyết thế nào

### Bảng đối chiếu (đường dẫn tính từ `chatbot/app/`)

| TC | Python làm gì | NestJS trước | Kết luận |
|---|---|---|---|
| 17 | `EmailStr` ⇒ dạng `.normalized` của `email_validator`: domain chữ thường (UTS-46), local part giữ hoa/thường (trừ hộp thư RFC 2142 như `postmaster`); tra cứu so bằng `==` (`schemas/user.py`, `repositories/user.py`) | chỉ trim; login còn **không** dùng chung hàm chuẩn hoá | **Sửa** — `User.normalizeEmail` port lại; login dùng chung |
| 18 | Đăng ký chặn > 72 byte; đăng nhập cắt 72 byte trước `checkpw` (`core/security/password.py:27`) | chặn khi đăng ký | Khớp — thư viện `bcrypt` của Node cũng chỉ dùng 72 byte đầu |
| 19 | refresh **7 ngày**, access **600 phút** (`core/config.py:300-307`) | refresh opaque 30 ngày, access 15 phút | **Khác có chủ đích** (thiết kế S2 mới) — chờ Hiếu chốt TTL |
| 21/22 | Refresh không xoay vòng, chỉ trả access mới; logout là no-op (`api/auth.py:61-73`) | xoay vòng + thu hồi | Khác có chủ đích (AUTH-02 theo spec) — FE phải refresh tuần tự là **hành vi mới** |
| 31 | `strip().lower()`; `lower(title)` chứa **hoặc** tin nhắn sống chứa (LIKE có escape); khi tìm thì **bỏ qua sort**, xếp: khớp nguyên 0, tiền tố 1, chứa 2, khớp tin 3, rồi `updated_at desc, id` (`repositories/conversation.py:36-58`) | ILIKE, giữ sort của client | **Sửa** — port nguyên thứ tự liên quan |
| 32 | `null` cho `title`/`planning_mode_enabled` ⇒ 422 | 400 | Khớp (khác mã do envelope chuẩn) |
| 33 | Xoá không chặn lượt đang chạy, cũng không dừng nó (`services/conversation_service.py:196-216`) | không chặn | Khớp |
| 34 | Xoá xong dọn **một** thread = id hội thoại (best-effort, nền) | outbox mang mọi `threadIds` | NestJS là tập lớn hơn — giữ |
| 37 | `MessageRead` có `interrupt` ← `message_metadata.interrupt`, `suggestedQuestions` ← `message_metadata.suggested_questions` (chỉ chuỗi); không có `sequence`; `sender` số | có `sequence`, `sender` chuỗi (S4) | Giữ; 2 trường kia ghi nhận nguồn (chưa thêm) |
| 40 | `messageCount` chỉ có khi `include=messages` | luôn có | Giữ (tập lớn hơn) |
| 41 | Chọn N tin mới nhất theo `(created_at desc, sequence desc)` rồi trả **cũ → mới** (`repositories/conversation.py:86-101`) | mới → cũ | **Sửa** |
| 45 | Tạo trong / gắn vào project ⇒ copy agent của project vào `conversation_custom_agents` | chưa | Xác nhận phạm vi PJ-08 (W2) |
| 46 | Gắn/gỡ đổi `updated_at` | đổi | Khớp |
| 47 | Gắn/gỡ trả `data: null`, message `"Conversation attached"` / `"Conversation detached"` | `{conversationId, projectId}` | Giữ (tập lớn hơn) — ghi nhận |
| 48 | Xem mục "TP-02" dưới | không ghi | **Sửa** |
| 49 | `round(completed/total*100, 2)`; next = in_progress đầu tiên theo `task_order`, không có thì pending đầu tiên; **GET planning-status bật `planning_mode_enabled` nếu có task** (`services/task_plan_service.py:533-584`) | khớp phép tính, không có tác dụng phụ | **Sửa** — thêm tác dụng phụ (TC-60) |
| 50 | Xoá cứng, không đánh lại số | giống | Khớp |
| 51 | `next_order = 0 if max is None else max + 1` (`task_plan_service.py:209-222`); thêm task ghi `task_metadata = {}` | bắt đầu 1, metadata null | **Sửa** |
| 52 | Không phân trang; `include_completed` mặc định false | giống | Khớp |
| 53 | `sha256(json.dumps({"source_conversation_id","message_id","title"}, sort_keys, separators=(",",":"), ensure_ascii=False))` (`services/conversation_fork_service.py:50-68`) | sha256 của mảng JSON | **Sửa** — test vàng sinh bằng chính Python |
| 54 | Copy persona, planning, project; `plan_lifecycle NULL`; tin giữ `sequence` gốc, `next_message_sequence = cutoff + 1`; tiêu đề mặc định `source[:248].rstrip() + " (fork)"`; **thêm**: viết lại metadata (đổi id, bỏ ảnh không còn), bỏ tin "hidden transcript artifact", ghi `fork_cutoff_eligible`, copy agent, tạo job tóm tắt (`repositories/conversation_fork.py:434-616`) | đánh số lại 1..n, tiêu đề = gốc | **Sửa** sequence + tiêu đề; phần metadata/agent ⇒ task **CONV-05** |
| 55 | count + `octet_length(content) + octet_length(metadata::text)`, ngưỡng 5 000 / 33 554 432 | giống | Khớp |
| 56 | Thứ tự kiểm: khoá nguồn → cutoff (404/409) → generation active 409 `conversation_turn_conflict` → có document 409 → 413 → eligibility 409 | hoãn | Ghi quy tắc vào CONV-05 / W3–W4 |
| 57 | Khoá lượt: poll 50 ms ≤ 30 s, key = 8 byte đầu sha256 big-endian (khớp `turnLockKey`); hết giờ ⇒ 409 **`conversation_turn_conflict`** | `conversation_busy` | **Sửa** mã lỗi |
| 58 | 201 "Conversation forked successfully", 200 "Conversation fork replayed"; người khác ⇒ **403** | "OK"; 404 | Giữ 404 (D15/TC-12 chốt "luôn 404"); text message ghi nhận |

### TP-02 — tính `plan_lifecycle`

Quy tắc port từ `TaskPlanService` (đọc tận mắt `services/task_plan_service.py:155-182, 427-437, 494-531`):

| Thao tác | Ghi vào hội thoại |
|---|---|
| Thêm task bằng tay (A36) | bật `planning_mode_enabled`, `plan_lifecycle = 'draft'` (kể cả khi đang `executing`) |
| Sửa / hoàn thành / xoá task (A39–A41) | tính lại từ **mọi** task: không còn task ⇒ NULL; tất cả completed/skipped ⇒ `completed`; có task in_progress/completed/skipped ⇒ `executing`; còn lại ⇒ `draft` |
| Xem planning-status (A42) | có task mà cờ planning đang tắt ⇒ bật lại (TC-60) |

`ready` và `paused` chỉ do workflow của Engine đặt — NestJS không bao giờ tự đặt.

Khác Python một chỗ có chủ đích: Python ghi lifecycle **sau** khi commit thay đổi task, ngoài transaction, nuốt
lỗi. NestJS làm trong **cùng transaction**, khoá dòng hội thoại trước (`FOR UPDATE`), nên hai thay đổi đồng thời
không ghi đè lifecycle bằng danh sách task cũ.

## Chi tiết kỹ thuật

### File chính

| Việc | File |
|---|---|
| Quy tắc lifecycle (domain thuần) | `src/modules/task-plans/domain/plan-lifecycle.ts` (+ spec) |
| Use case ghi lifecycle, khoá hội thoại | `src/modules/task-plans/application/task-plan.use-cases.ts` |
| `setPlanState` (UPDATE chỉ khi đổi) | `src/modules/task-plans/infrastructure/typeorm-task-plan.repository.ts` |
| Fingerprint Python | `src/modules/conversations/infrastructure/fork-adapters.ts` (+ spec, giá trị vàng từ Python) |
| Tiêu đề mặc định, độ dài theo code point | `src/modules/conversations/domain/conversation.ts` (+ spec) |
| Copy giữ `sequence` | `src/modules/messages/infrastructure/typeorm-fork-message-source.ts` |
| Thứ tự preview | `src/modules/messages/infrastructure/typeorm-message-digest.ts` |
| Tìm kiếm + thứ tự liên quan | `src/modules/conversations/infrastructure/typeorm-conversation.repository.ts` |
| Chuẩn hoá email | `src/modules/identity/domain/user.ts`, `application/auth.use-cases.ts` (+ `user-email.spec.ts`) |
| Mã lỗi khoá lượt | `src/platform/database/pg-turn-lock.ts` |

### Code then chốt

```ts
// fork-adapters.ts — cùng byte với json.dumps(sort_keys, separators=(",", ":"), ensure_ascii=False)
const canonical = JSON.stringify({
  message_id: input.messageId.toLowerCase(),
  source_conversation_id: input.sourceConversationId.toLowerCase(),
  title: input.title,
});
return createHash('sha256').update(canonical, 'utf8').digest('hex');
```

```sql
-- setPlanState: chỉ UPDATE khi giá trị đổi (Python ghi qua ORM, không đổi thì không UPDATE ⇒ updated_at giữ nguyên)
UPDATE conversations
   SET plan_lifecycle = $2, planning_mode_enabled = planning_mode_enabled OR $3, updated_at = $4
 WHERE id = $1 AND (plan_lifecycle IS DISTINCT FROM $2 OR ($3 AND NOT planning_mode_enabled))
```

### Giá trị vàng lấy từ Python

```text
fork_request_fingerprint(source=0f8c3a52-…, message=a1b2c3d4-…, title=None)
  = 74a675481730c70624a9ccbab9044ec9e44319eb6cf9b423b29ac3204302ca5b
title = 'Nhánh thử "x"\n\u2028\t\x01😀'
  = 370e856a794c5d188be9076f7b74760a79ab30708c327e9616fed83d77119818
pydantic EmailStr: '  Hieu@Example.COM ' → 'Hieu@example.com'; 'PostMaster@Example.com' → 'postmaster@example.com';
                   'Info.Team@X.io' → 'Info.Team@x.io'   (khớp 5/5 với User.normalizeEmail)
```

### Kết quả chạy thật (2026-11-18, server build + Postgres local)

```text
PASS  fresh conversation: lifecycle NULL, planning off            -> "|f"
PASS  A36 201, task_order 0 and 1, metadata {}                     -> [[0,{}],[1,{}]]
PASS  after add: draft + planning on                               -> "draft|t"
PASS  in_progress ⇒ executing                                      -> "executing|t"
PASS  completed + skipped ⇒ completed                              -> "completed|t"
PASS  no lifecycle change ⇒ conversations.updated_at unchanged
PASS  adding again resets to draft                                 -> "draft|t"
PASS  delete ⇒ recomputed (b skipped, c pending ⇒ executing)       -> "executing|t"
PASS  A42 turns planning mode on when tasks exist (Python side effect)
PASS  last task deleted ⇒ lifecycle NULL                           -> "|t"
PASS  other user ⇒ 404, lifecycle untouched                        -> [404,"draft|t"]
PASS  concurrent changes: lifecycle consistent with tasks          -> ["pending,completed,completed","executing|t"]
PASS  fork 201, title "<source> (fork)"                            -> [201,"Nguồn thử (fork)"]
PASS  child keeps source sequences 1,2,5,6; next_message_sequence 7
PASS  stored fingerprint = Python formula
PASS  replay ⇒ 200 same child
PASS  CHECK fork_request_fields_together rejects id without fingerprint
PASS  A9 latestMessages: newest 3, oldest first                    -> [2,5,6]
PASS  signup stores Python-normalized email                        -> "Mixed…@example.com"
PASS  login with other domain case works                           -> 200
PASS  local part stays case-sensitive (like Python) ⇒ 401
PASS  search relevance: ["zq…","zq… prefix","has zq… inside","nothing here"]  (tạo theo thứ tự ngược, sort=title bị bỏ qua)
PASS  search "%" is literal: 0
```

Lần chạy đầu bắt được một lỗi thật: **login không chuẩn hoá email** (comment nói có, code chỉ `trim`) ⇒ đã sửa.

`pnpm verify`: 23 suite, 141 test xanh; dependency-cruiser không vi phạm.

## Giới hạn & việc còn lại

- **CONV-05** (mới): phần còn lại của fork theo Python — viết lại metadata (`snapshot_fork_message`, đổi id tham
  chiếu), bỏ ảnh không còn sở hữu (cần `chat_images`, `web_image_references` — W3), bỏ "hidden transcript
  artifact", ghi `fork_cutoff_eligible`, copy agent (W2), kiểm generation/document (W3–W4).
- Python ghi `completed_at = now` cả khi hoàn thành lại một task đã xong; NestJS giữ mốc cũ (A40) — khác nhỏ, giữ.
- Tiêu đề fork chứa khoảng trắng đầu/cuối: Python lưu nguyên, NestJS trim khi lưu (fingerprint vẫn tính trên
  chuỗi gốc như Python).

## Điểm tranh cãi & quyết định

### TC-60 — GET planning-status có ghi DB (bật planning mode)
- **Bối cảnh:** Python `get_planning_status` bật `planning_mode_enabled` nếu hội thoại có task mà cờ đang tắt.
- **Phương án:** A) giữ như Python (GET có tác dụng phụ); B) bỏ — GET thuần đọc.
- **Đang chọn:** A — Engine đọc cờ này; khác Python thì hành vi lượt chat sau đó sẽ khác.
- **Trạng thái:** tạm chọn — **Hiếu xem**.

### TC-61 — Ghi lifecycle trong cùng transaction thay vì sau commit như Python
- **Đang chọn:** cùng transaction + khoá dòng hội thoại — kết quả cuối giống Python, không có cửa sổ ghi đè.
- **Trạng thái:** tạm chọn.

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-18 | TP-02; sửa fingerprint/tiêu đề/sequence fork, mã `conversation_turn_conflict`, thứ tự preview, tìm kiếm theo độ liên quan, chuẩn hoá email (cả login); đóng/ghi nhận TC-17…58 | Có repo Python |

## Gợi ý review

- TC-60 (GET có ghi) và các dòng "Khác có chủ đích" trong bảng: TC-19, 21/22, 58 (403 vs 404).
- FE: tin xem trước đổi thứ tự (cũ → mới); `task_order` bắt đầu 0; tìm kiếm bỏ qua `sort`.
