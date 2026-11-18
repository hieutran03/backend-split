# 020 — Tin nhắn dạng UIMessage cho AI SDK

> Task: MSG-02 (A26 → A10 `format=ui-message`) · Ngày: 2026-11-18 · Trạng thái: chờ review

## Tóm tắt dễ hiểu

Giao diện chat (FE) dùng thư viện Vercel AI SDK. Thư viện này muốn lịch sử tin nhắn ở một dạng riêng gọi là
**UIMessage**: mỗi tin có danh sách "mảnh" (`parts`) — đoạn chữ, ảnh, nguồn trích dẫn. Python có một route riêng
(A26) để đổi tin nhắn đã lưu sang dạng này. Giờ NestJS làm được việc đó trên chính route đọc tin nhắn:

```
GET /api/v1/conversations/{id}/messages?format=ui-message
```

Cách đổi phụ thuộc vào **client hiểu được tới đâu**: client "giàu" (`inlineRichResponseV1=true`) nhận các dấu
`<!--rich:id-->` trong nội dung và danh sách mục giàu (`rich_items`); client thường nhận nội dung đã gỡ dấu, ảnh
chuyển thành mảnh `file`, biểu đồ chuyển thành bảng Markdown dự phòng. Kết quả **giống từng byte** với Python —
kiểm chứng bằng 65 trường hợp sinh ra từ chính code Python.

Đi kèm một sửa lỗi bảo mật nhỏ: Python **luôn xoá đường dẫn ảnh gốc riêng tư** (`original_image_url`) khỏi
metadata khi trả tin nhắn. NestJS trước đây trả metadata thô ở A10/A19/A20 — giờ làm sạch như Python.

## Vấn đề cần giải quyết

- MSG-02 bị chặn vì cần code `ai_sdk_projection.py`.
- Projection không chỉ là đổi tên trường: nó gọi bộ parser dấu `<!--rich:…-->` (bỏ qua code fence, code thụt lề,
  inline code), bộ làm sạch ảnh riêng tư, chuyển "source figure" sang dạng cũ, chọn ảnh hiển thị, thêm nguồn web…
  — khoảng 600 dòng Python rải ở 4 file.
- Không có cách "nhìn là biết đúng": phải so với Python bằng dữ liệu thật.

## Đã giải quyết thế nào

1. Port từng hàm Python sang TypeScript thuần trong `messages/domain/ui-message/` (không framework):

   | File TS | Port từ Python |
   |---|---|
   | `py-compat.ts` | ngữ nghĩa Python: `str.strip()`, truthiness, `str()`, `json.dumps` mặc định, `base64.b64decode(validate=False)` |
   | `rich-markers.ts` | `rich_response.py`: parse / strip / strip malformed / remove / expand marker |
   | `rich-sanitize.ts` | `rich_response.py`: `sanitize_public_image_fields`, `sanitize_public_rich_metadata` |
   | `source-figures.ts` | `source_figures.py`: `is_source_figure`, `legacy_source_figure` |
   | `rich-projection.ts` | `rich_projection.py` (+ hằng số `answer_visuals.py`) |
   | `ui-message.ts` | `ai_sdk_projection.py` + vòng lặp của `get_conversation_messages_ai_sdk` (`api/ai_sdk.py`) |

2. **Dữ liệu vàng từ Python**: script [`scripts/golden/ui_message_golden.py`](../../scripts/golden/ui_message_golden.py)
   chạy **code Python thật** (`MessageRead` + các hàm projection) trên 13 tin nhắn mẫu × 5 bộ cờ = 65 trường hợp,
   ghi `test/fixtures/ui-message-golden.json`. Test TS (`ui-message.spec.ts`) so `toEqual` từng trường hợp.
   (`app.api.ai_sdk` không import được trên máy vì kéo theo sklearn bị Application Control chặn DLL, nên vòng lặp
   30 dòng của endpoint được chép nguyên văn vào script, có ghi nguồn.)

3. Nối vào A10: cùng trang, cùng quyền sở hữu, cùng sắp xếp mặc định `-sequence` như A10 thường; chỉ khác hình dạng item.

## Chi tiết kỹ thuật

### Request / Response mẫu (chạy thật 2026-11-18)

Tin assistant lưu trong DB: `content = "See <!--rich:img1--> done"`, metadata có `rich_items` (ảnh
`/chat-images/1` kèm `original_image_url` riêng tư), `web_sources`, `images_count`, `_debug`.

`GET …/messages?format=ui-message` (client thường):

```json
{
  "id": "2107d556-…", "role": "assistant", "content": "See  done",
  "parts": [
    { "type": "text", "text": "See  done" },
    { "type": "file", "url": "/chat-images/1", "mediaType": "image/png" },
    { "type": "source-url", "sourceId": "https://src", "url": "https://src", "title": "Src" }
  ],
  "metadata": { "web_sources": [{ "url": "https://src", "title": "Src" }] },
  "createdAt": "2026-11-18T02:58:22.510Z"
}
```

`…&inline_rich_response_v1=TRUE` (client giàu, cờ dạng snake_case như Python):

```json
{
  "content": "See <!--rich:img1--> done",
  "parts": [ { "type": "text", "text": "See <!--rich:img1--> done" }, { "type": "source-url", … } ],
  "metadata": { "rich_items": [{ "id": "img1", "type": "image", "payload": { "url": "/chat-images/1" } }],
                "web_sources": [ … ], "rich_items_version": 1 }
}
```

Kết quả kịch bản:

```text
PASS  A10 default shape unchanged + metadata sanitized (original_image_url gone)
PASS  ui-message, no flags: markers stripped, image file part, source part, scrubbed metadata
PASS  envelope { items, meta }                       -> {"page":1,"limit":20,"total":2,"totalPages":1}
PASS  ui-message rich (snake_case flag, FastAPI bool): marker kept, no file part, rich_items sanitized
PASS  user message: text part, metadata null
PASS  format=ui-message + include ⇒ 400
PASS  bad flag value ⇒ 400
PASS  unknown format ⇒ 400
PASS  unknown conversation ⇒ 404 conversation_not_found
```

`pnpm verify`: 25 suite, 212 test xanh (65 test vàng + 4 test use case); dependency-cruiser không vi phạm.

### Những chỗ "giống Python" dễ sai mà test vàng bắt được

- `str.strip()` của Python bỏ cả `\x1c–\x1f`, `\x85` và **không** bỏ `U+FEFF` — khác `String.trim()`.
- `base64.b64decode(validate=False)`: bỏ qua ký tự lạ, dừng ở pad đủ, lỗi khi thiếu pad; chuỗi có ký tự ngoài
  ASCII ⇒ lỗi trước khi giải mã (đã thử 10 trường hợp biên với CPython).
- `rich_items_version: true` cũng là v1 (`True == 1`).
- JSON trong chuỗi chứa `original_image_url` được làm sạch rồi in lại bằng `json.dumps` **mặc định** (`", "`, `": "`).
- `legacy_source_figure` với payload rỗng: Python sửa một dict tách rời ⇒ kết quả không đổi.

### Cấu hình

`INLINE_RICH_RESPONSE_ENABLED` (mặc định `true`) = `inline_rich_response_enabled` của Python: tắt thì mọi client
nhận dạng thường dù gửi cờ gì.

## Cách thử

```bash
pnpm jest --config config/jest/unit.config.js ui-message      # 65 trường hợp vàng
# sinh lại dữ liệu vàng khi Python đổi (cần venv của repo chatbot):
<chatbot>/.venv/Scripts/python -I scripts/golden/ui_message_golden.py <chatbot>
```

## Giới hạn & việc còn lại

- `createdAt` dạng `…Z` (toàn NestJS dùng `toISOString`); Python in `+00:00` và bỏ phần micro giây khi bằng 0.
- Thứ tự khoá JSON: JS đưa khoá dạng số lên đầu object — chỉ ảnh hưởng metadata có khoá như `"1"`; client JSON không phụ thuộc.
- Số thực `1.0` trong chuỗi JSON đã làm sạch in thành `1` (JS không phân biệt int/float).
- Phần projection dùng cho **stream** (`project_ai_sdk_message_event`, `VisualMarkerStreamFilter`) thuộc GEN-06 (W4).
- `interrupt`, `suggestedQuestions` của `MessageView` (A10 thường) vẫn chưa thêm (TC-37).

## Điểm tranh cãi & quyết định

### TC-62 — `include=feedback` cùng `format=ui-message`
- **Bối cảnh:** Python A26 không có feedback. UIMessage không có chỗ cho feedback.
- **Phương án:** A) 400; B) lặng lẽ bỏ qua.
- **Đang chọn:** A — cùng lý do TC-38 (bỏ qua lặng lẽ làm FE tưởng không có feedback).
- **Trạng thái:** tạm chọn.

### TC-63 — Nhận cờ dạng snake_case và giá trị bool kiểu FastAPI
- **Bối cảnh:** Python nhận `inlineRichResponseV1` **và** `inline_rich_response_v1`, giá trị `true/1/yes/on`…
- **Đang chọn:** nhận cả hai như Python để FE cũ không vỡ; LEG-01 có thể bỏ dạng snake_case sau.
- **Trạng thái:** tạm chọn.

### TC-64 — Làm sạch metadata ở A10/A19/A20 (không chỉ ui-message)
- **Bối cảnh:** Python `MessageRead` làm sạch metadata ở mọi lần đọc tin. NestJS trước đây trả thô ⇒ lộ `original_image_url`.
- **Đang chọn:** làm sạch mọi nơi trả `MessageView` (kể cả `latestMessages` trong danh sách hội thoại).
- **Trạng thái:** tạm chọn (coi như sửa lỗi).

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| v1 | 2026-11-18 | Port projection UIMessage + 65 test vàng sinh từ Python; `format=ui-message` trên A10; làm sạch metadata ở MessageView | MSG-02 hết bị chặn (có repo Python) |

## Gợi ý review

- Thử trên Swagger: `GET /conversations/{id}/messages?format=ui-message&inlineRichResponseV1=true`.
- TC-62…64.
