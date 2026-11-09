# Route mapping (nguồn: tài liệu Backend Split §4.2)

> Sinh từ artifact "Chatbot Backend Split" (commit chatbot 12360d7f). Không sửa tay —
> nếu spec đổi, sinh lại. Cột **Task** khớp với docs/PLAN.md.

## Auth & users

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A1 | W1 | Backend | `POST /auth/signup` | `POST /api/v1/auth/signup` | — | Duplicate email/username → `409 conflict` (today 422 `EMAIL_NOT_AVAILABLE`/`USERNAME_NOT_AVAILABLE`). New `role` in the user payload (default `user`). |
| A2 | W1 | Backend | `POST /auth/login` | `POST /api/v1/auth/login` | — | `refreshToken` is now **opaque** (stored hashed in `refresh_tokens`), `expiresIn` = 900 (today 36000). Invalid credentials → `401 unauthorized` with `code` (today `http_error`). |
| A3 | W1 | Backend | `POST /auth/refresh` | `POST /api/v1/auth/refresh` | — | Refresh token sent in the **body** `{ refreshToken }` (today as Bearer header). **Rotation**: response returns a new `refreshToken`; the old one is revoked; reuse of a revoked token revokes the whole family. |
| A4 | W1 | Backend | `POST /auth/logout` | `POST /api/v1/auth/logout` | — | Actually revokes: body `{ refreshToken }` revokes that token; `{ allDevices: true }` revokes all of the user's refresh tokens. |
| A5 | W1 | Backend | `GET /users/{user_id}` | `GET /api/v1/users/me` | — | Path id removed (own profile only anyway). |

## Conversations

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A6 | W4 | Backend→Engine | `POST /conversations/generate-title` | `POST /api/v1/conversations/generate-title` | E6 POST /internal/v1/titles | Body `{ message, conversationId? }`; `message` capped at 8000 chars. Response `{ title, fallback }`. Title still not persisted by this route. |
| A7 | W1 | Backend | `POST /conversations/` | `POST /api/v1/conversations` | — | S8. `201 created`. |
| A8 | W1 | Backend | `GET /conversations/{conversation_id}` | `GET /api/v1/conversations/{conversationId}` | — | `customAgents` (never populated today) removed; use `GET /conversations/{id}/custom-agents`. |
| A9 | W1 | Backend | `GET /conversations/` | `GET /api/v1/conversations` | — | S2. `include=messages` + `latestMessages` (now bounded 0..20) kept; `include=feedback` (ignored today) rejected with 400. `search` kept (≤200). |
| A10 | W1 | Backend | `GET /conversations/{conversation_id}/messages` | `GET /api/v1/conversations/{conversationId}/messages` | — | S2, S4. `include=feedback` kept. New optional `format=ui-message` returns the AI SDK UIMessage projection (replaces A26). Default sort `-sequence` (stable order by `messages.sequence`). |
| A11 | W1 | Backend | `PATCH /conversations/{conversation_id}` | `PATCH /api/v1/conversations/{conversationId}` | — | Explicit `null` clears `personaPrompt`; `title: null` rejected. |
| A12 | W1 | Backend→Engine | `DELETE /conversations/{conversation_id}` | `DELETE /api/v1/conversations/{conversationId}` | E2 (active turn), E5 threads/delete via outbox conversation.deleted | Soft delete + outbox; checkpoint cleanup is now guaranteed (retried) instead of best-effort in-process. An active turn does not block the delete: it is stopped through E2 and the delete proceeds. Hiện tại (S8.3): chỉ xoá thread id kiểu cũ, thread `routing-v2:*` do retention sweep dọn; hội thoại con của fork giữ nguyên. |
| A12a | W1 | Backend | `POST /conversations/{conversation_id}/fork` | `POST /api/v1/conversations/{conversationId}/forks` | outbox conversation.forked → Engine tạo job tóm tắt cho hội thoại con | Mới ở `d5a7c7ff` (09/10). Body `{ messageId, requestId, title? }`. `201` khi tạo mới, `200` khi replay cùng `requestId` + fingerprint. Từ chối: 404 message không thuộc nguồn, 409 không phải assistant hoàn tất / còn generation active / có tài liệu / `requestId` đã dùng cho fork khác, 410 con đã bị xoá, 413 prefix > 5.000 message hoặc 32 MB. Giữ khoá lượt của hội thoại nguồn và một transaction REPEATABLE READ (sơ đồ S8). Hiện ghi `conversation_summary_jobs` (bảng Engine) trong cùng transaction. |

## Messages & generations

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A13 | W4 | Backend→Engine | `POST /messages/ (sync)` | `POST /api/v1/conversations/{conversationId}/generations with body stream: false` | E1 POST /internal/v1/turns (backend consumes the stream to the end) | Mode selector per D23: body `stream` (bool, default `true`); `stream: false` returns JSON. `conversationId` moves to the path. Returns `{ generation, userMessage, assistantMessage }` (today only the **user** message). Now creates a `generations` row, so sync turns can be stopped/continued. `202` with `interrupt` when HITL pauses; `role=2` (insert an assistant row) removed. |
| A14 | W4 | Backend→Engine | `POST /messages/stream` | `POST /api/v1/conversations/{conversationId}/generations (body stream: true, the default; query protocol=sse, the default)` | E1 | D23: `protocol=ai-sdk` on the same route returns the AI SDK UI Message Stream instead. Internal SSE protocol kept (event names, 1 s heartbeat) but payloads camelCase (S3). S7: ownership/conflict → 4xx before the stream (`409 conflict` `CONVERSATION_TURN_CONFLICT`). Client disconnect no longer cancels the turn (D5). |
| A15 | W4 | Backend→Engine | `POST /messages/stop` | `POST /api/v1/generations/{generationId}/stop` | E2 POST /internal/v1/turns/{generationId}/stop | `generationId` in the path; stopping by `userMessageId` only is dropped (compat layer resolves it). Body `{ expectedVersion?, idempotencyKey? }`. Stale/illegal commands → `409 conflict` (today 500). Response `{ status: cancelled|stop_requested|not_inflight, generation, message }`, 200/202 kept. |
| A16 | W4 | Backend | `GET /messages/generations/{generation_id}?conversation_id=` | `GET /api/v1/generations/{generationId}` | — | Query `conversation_id` removed (ownership from the row). Snapshot adds `leaseExpiresAt`. |
| A17 | W4 | Backend→Engine | `POST /messages/continue` | `POST /api/v1/generations/{generationId}/continue` | E4 POST /internal/v1/generations/{generationId}/continue | `generationId` in the path; body `{ continuationId, expectedVersion, idempotencyKey, inlineRichResponseV1 }`. `protocol=sse` (default) or `protocol=ai-sdk` selects the stream protocol (replaces A29). Refusals (`stale_command`, `continuation_unavailable`, …) → `409` before the stream (S7). |
| A18 | W4 | Backend→Engine | `POST /messages/resume-interrupt` | `POST /api/v1/hitl-interrupts/{interruptId}/resume` | E3 POST /internal/v1/interrupts/{interruptId}/resume | interruptId in the path; body { threadId, conversationId, deviceId?, decisions[], inlineRichResponseV1 }, decisions camelCase only. INTERRUPT_* validation errors become 4xx before the stream (404/409/422 as today's in-stream status_code). **Expired interrupt → 409 conflict with data.errorCode = interrupt_expired (D16; today 410 INTERRUPT_EXPIRED).** Stream protocol via query protocol=sse|ai-sdk (D23). protocol=ai-sdk replaces A28. |
| A19 | W1 | Backend | `GET /messages/{message_id}` | `GET /api/v1/messages/{messageId}` | — | S3, S4. Not-owned → 404 (today 403; D15). |
| A20 | W1 | Backend | `GET /messages/` | `GET /api/v1/messages` | — | S2, S8. Optional `conversationId` filter. |

## AI SDK surface

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A21 | W1 | Backend | `POST /ai/conversations` | `POST /api/v1/conversations` | — | Duplicate surface folded into A7. |
| A22 | W1 | Backend | `GET /ai/conversations` | `GET /api/v1/conversations` | — | Folded into A9 (full parameter set now available). |
| A23 | W1 | Backend | `GET /ai/conversations/{conversation_id}` | `GET /api/v1/conversations/{conversationId}` | — | Folded into A8. |
| A24 | W1 | Backend | `PATCH /ai/conversations/{conversation_id}` | `PATCH /api/v1/conversations/{conversationId}` | — | Folded into A11. |
| A25 | W1 | Backend→Engine | `DELETE /ai/conversations/{conversation_id}` | `DELETE /api/v1/conversations/{conversationId}` | E5 via outbox | Folded into A12. |
| A26 | W1 | Backend | `GET /ai/conversations/{conversation_id}/messages` | `GET /api/v1/conversations/{conversationId}/messages?format=ui-message` | — | UIMessage projection (`id, role, content, parts, metadata, createdAt`) now inside the standard list envelope `{ items, meta }` (today `{ messages, meta }`). `inlineRichResponseV1` query kept. |
| A27a | W4 | Backend→Engine | `POST /api/chat/{conversation_id}` | `POST /api/v1/conversations/{conversationId}/chat` | E1 | AI SDK UI Message Stream v1 (`x-vercel-ai-ui-message-stream: v1`, one `[DONE]`). `messageId` = reserved assistant id (unchanged). Body `userId` ignored (as today). S7 for pre-stream errors. Từ 15/10 (`3a8baab3`): frame phải qua parser `ai@6.0.0`; keepalive là comment `: keepalive` mỗi 15 s (không còn frame `heartbeat`); `statusCode`/`errorCode` chuyển sang `data-stream-error`, `render` sang `data-tool-render`; kết thúc lỗi/thiếu có `finishReason: "error"` (`stream_incomplete`, `stream_malformed`, `stream_event_too_large`); một frame tối đa 8 MiB; tuỳ chọn `streamWebAnswerV1` (bản nháp + `data-answer-reconcile`). Sơ đồ S1.7. |
| A27b | W4 | Backend→Engine | `POST /ai/chat/{conversation_id} (hidden alias)` | `POST /api/v1/conversations/{conversationId}/chat` | E1 | Alias removed from `/api/v1`; compat layer only. |
| A28 | W4 | Backend→Engine | `POST /ai/resume-interrupt` | `POST /api/v1/hitl-interrupts/{interruptId}/resume?protocol=ai-sdk` | E3 | Same as A18 with the AI SDK projector. Từ 15/10 body nhận `streamWebAnswerV1` và dùng chung hợp đồng frame mới của A27a. |
| A29 | W4 | Backend→Engine | `POST /ai/continue` | `POST /api/v1/generations/{generationId}/continue?protocol=ai-sdk` | E4 | Same as A17 with the AI SDK projector. Từ 15/10 body nhận `streamWebAnswerV1` và dùng chung hợp đồng frame mới của A27a. |

## Feedback

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A30 | W1 | Backend | `POST /messages/{message_id}/feedbacks` | `POST /api/v1/messages/{messageId}/feedback` | — | **Security fix**: caller must own the message's conversation. `messageId` no longer required in the body. Create only: existing feedback → `409 conflict` (use PATCH); today an upsert, and a second user's feedback crashed with 500. |
| A31 | W1 | Removed | `GET /messages/{message_id}/feedbacks/stats` | `— (use GET /api/v1/messages/{messageId}/feedback, which carries rating)` | — | **Security fix**: was public. Compat layer answers it for authenticated owners only. |
| A32 | W1 | Backend | `GET /messages/{message_id}/feedbacks/user` | `GET /api/v1/messages/{messageId}/feedback` | — | Returns the caller's feedback or `404 not_found` (today `data: null`). |
| A33 | W1 | Backend | `GET /messages/{message_id}/feedbacks` | `GET /api/v1/messages/{messageId}/feedback` | — | **Security fix**: was public. Single object instead of a 0/1-element list. |
| A34 | W1 | Backend | `PUT /messages/{message_id}/feedbacks/{feedback_id}` | `PATCH /api/v1/messages/{messageId}/feedback` | — | Feedback addressed by message (1:1); path `messageId` is now checked (ignored today); `code: "ok"` like every success. |

## Task plans

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A35 | W4 | Backend→Engine | `POST /conversations/{conversation_id}/task-plans (LLM)` | `POST /api/v1/conversations/{conversationId}/task-plans/generate` | E7 POST /internal/v1/task-plans/generate | Explicit `/generate` action. Empty/invalid plan → `422 unprocessable_entity` `PLAN_EMPTY` (today 500). |
| A36 | W1 | Backend | `POST /conversations/{conversation_id}/task-plans/manual` | `POST /api/v1/conversations/{conversationId}/task-plans` | — | Manual creation takes the collection POST. Blank descriptions → 400 (today 500). |
| A37 | W1 | Backend | `GET /conversations/{conversation_id}/task-plans?include_completed=` | `GET /api/v1/conversations/{conversationId}/task-plans?includeCompleted=` | — | Query renamed (S3). |
| A38 | W1 | Backend | `GET /task-plans/{task_id}` | `GET /api/v1/task-plans/{taskPlanId}` | — | — |
| A39 | W1 | Backend | `PATCH /task-plans/{task_id}` | `PATCH /api/v1/task-plans/{taskPlanId}` | — | `completedAt` no longer client-settable (derived from `status`). |
| A40 | W1 | Backend | `POST /task-plans/{task_id}/complete` | `POST /api/v1/task-plans/{taskPlanId}/complete` | — | — |
| A41 | W1 | Backend | `DELETE /task-plans/{task_id}` | `DELETE /api/v1/task-plans/{taskPlanId}` | — | Still a hard delete. |
| A42 | W1 | Backend | `GET /conversations/{conversation_id}/planning-status` | `GET /api/v1/conversations/{conversationId}/planning-status` | — | — |

## HITL

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A43 | W5 | Backend | `GET /hitl/settings?deviceId=` | `GET /api/v1/client-devices/{deviceId}/tool-approval-settings` | — | Device moves from query to path; malformed/foreign device → 404. `masterEnabled`/`globalTools` read from shared config (see internal API §3.7). |
| A44 | W5 | Backend | `POST /hitl/settings?deviceId=` | `PUT /api/v1/client-devices/{deviceId}/tool-approval-settings` | — | Bulk upsert is a `PUT` of `{ items[] }`. Device-not-connected / target-not-in-catalog stay `409 conflict`. |
| A45 | W5 | Backend | `DELETE /hitl/settings?deviceId&toolOrigin&scopeType&scopeValue` | `DELETE /api/v1/client-devices/{deviceId}/tool-approval-settings?toolOrigin&scopeType&scopeValue` | — | camelCase query only. |
| A46 | W4 | Backend | `GET /hitl/interrupts/{interrupt_id}` | `GET /api/v1/hitl-interrupts/{interruptId}` | — | The read no longer mutates: expiry is done by the backend scheduler sweep, which also writes outbox `interrupt.expired` → E5 `threads/delete` (D17). The response still reports `expired` when past `expiresAt`. Not-owned → 404 (D15). |

## Media

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A47 | W3 | Backend | `GET /chat-images/{image_id}` | `GET /api/v1/chat-images/{imageId}` | — | Bytes from object storage (`storage_key`), legacy disk path fallback while `storage_path` rows remain. Adds `Cache-Control: private, max-age=300`, `nosniff`, sandbox CSP. Errors use the envelope (today `http_error`). |
| A48 | W3 | Backend | `GET /web-images/{image_id}` | `GET /api/v1/web-images/{imageId}` | — | SSRF-guarded fetch moves to the backend unchanged; 502/504 kept. |
| A49 | W3 | Backend→Engine | `GET /tool-results/{blob_id}` | `GET /api/v1/tool-results/{blobId}` | E10 GET /internal/v1/tool-results/{blobId} | Raw text passthrough; 404 for missing/foreign. |

## Usage

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A50 | W6 | Backend | `GET /usage/capabilities` | `GET /api/v1/usage/capabilities` | — | Flag from backend config. |
| A51 | W6 | Backend→Engine | `GET /usage/dashboard` | `GET /api/v1/usage/dashboard` | E11 GET /internal/v1/usage/dashboard | Backend checks flag + `conversationId` ownership, joins `topConversations[].title`. Range errors → `400 bad_request` (today 422). |
| A52 | W6 | Backend→Engine | `GET /usage/conversations/{conversation_id}` | `GET /api/v1/usage/conversations/{conversationId}` | E12 GET /internal/v1/usage/conversations/{conversationId} | `latestContextWindow` now camelCase (S3). |

## Custom agents

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| A53a | W2 | Backend | `GET /custom-agents` | `GET /api/v1/custom-agents` | — | Availability computed from Redis `client-runtime:session:{deviceId}` (backend reads it directly). Becomes paginated (S2). |
| A53b | W2 | Backend | `GET /ai/custom-agents` | `GET /api/v1/custom-agents` | — | Duplicate mount dropped. |
| A54a | W2 | Backend→Engine | `POST /custom-agents` | `POST /api/v1/custom-agents` | E18 GET /internal/v1/mcp/tools (server tool validation) | `server_mcp` refs validated against the engine catalog; provider/model validated against the backend-owned provider catalog. Duplicate name/slug → `409 conflict` (today 400). |
| A54b | W2 | Backend→Engine | `POST /ai/custom-agents` | `POST /api/v1/custom-agents` | E18 | Duplicate mount dropped. |
| A55a | W2 | Backend→Engine | `GET /custom-agents/options` | `GET /api/v1/custom-agents/options` | E18 | Inner keys camelCase (`providerType`, `serverName`, `qualifiedToolId`, `lookupName`, …). `serverTools` (always empty) removed. |
| A55b | W2 | Backend→Engine | `GET /ai/custom-agents/options` | `GET /api/v1/custom-agents/options` | E18 | Duplicate mount dropped. |
| A56a | W2 | Backend | `GET /custom-agents/{custom_agent_id}` | `GET /api/v1/custom-agents/{customAgentId}` | — | Other user's agent → 404 (today 403 `CUSTOM_AGENT_FORBIDDEN`; D15). |
| A56b | W2 | Backend | `GET /ai/custom-agents/{custom_agent_id}` | `GET /api/v1/custom-agents/{customAgentId}` | — | Duplicate mount dropped. |
| A57a | W2 | Backend→Engine | `PATCH /custom-agents/{custom_agent_id}` | `PATCH /api/v1/custom-agents/{customAgentId}` | E18 | "In use" check now queries `generations` (active) + `hitl_interrupts` (pending) instead of the in-process registry (M7), so it sees turns on every instance. `409 CUSTOM_AGENT_IN_USE` kept. |
| A57b | W2 | Backend→Engine | `PATCH /ai/custom-agents/{custom_agent_id}` | `PATCH /api/v1/custom-agents/{customAgentId}` | E18 | Duplicate mount dropped. |
| A58a | W2 | Backend | `DELETE /custom-agents/{custom_agent_id}` | `DELETE /api/v1/custom-agents/{customAgentId}` | — | Same durable in-use check as A57. |
| A58b | W2 | Backend | `DELETE /ai/custom-agents/{custom_agent_id}` | `DELETE /api/v1/custom-agents/{customAgentId}` | — | Duplicate mount dropped. |
| A59a | W2 | Backend | `GET /conversations/{conversation_id}/custom-agents` | `GET /api/v1/conversations/{conversationId}/custom-agents` | — | — |
| A59b | W2 | Backend | `GET /ai/conversations/{conversation_id}/custom-agents` | `GET /api/v1/conversations/{conversationId}/custom-agents` | — | Duplicate mount dropped. |
| A60a | W2 | Backend | `PUT /conversations/{conversation_id}/custom-agents` | `PUT /api/v1/conversations/{conversationId}/custom-agents` | — | Duplicate ids → 400 (today 422). |
| A60b | W2 | Backend | `PUT /ai/conversations/{conversation_id}/custom-agents` | `PUT /api/v1/conversations/{conversationId}/custom-agents` | — | Duplicate mount dropped. |

## Documents

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| D1 | W3 | Backend→Engine | `POST /documents/upload (form file, conversation_id)` | `POST /api/v1/conversations/{conversationId}/documents (multipart files, one or more)` | E8 POST /internal/v1/documents/{documentId}/index via outbox document.uploaded; progress via B1 | Single-file wrapper folded into the batch route. File stored in object storage (`uploads`), not local temp disk. Batch status policy (201/207/400/409) kept. |
| D2 | W3 | Backend→Engine | `POST /documents/uploads` | `POST /api/v1/conversations/{conversationId}/documents` | E8 via outbox, B1 | `conversationId` moves from a form field to the path. Per-file results camelCase; `status` as string. |
| D3 | W3 | Backend | `GET /documents/task/{task_id}` | `GET /api/v1/documents/{documentId}/processing-status` | — (fed by B1) | **Security fix**: addressed by document (ownership always checked); Celery task ids are no longer exposed. Response `{ status, stage, progress, failureCode, processedAt, stats }`; no more `PENDING` during parse (chain-tail id bug). |
| D4 | W3 | Backend | `GET /documents/{document_id}` | `GET /api/v1/documents/{documentId}` | — | S3, S4; adds `sizeBytes`, `failureCode`, `processedAt`. |
| D5 | W3 | Backend | `GET /documents/conversation/{conversation_id}?page&page_size` | `GET /api/v1/conversations/{conversationId}/documents` | — | S2 (`page_size` → `limit`; `page_size=0` → 400, today 500). |
| D6 | W3 | Backend | `PUT /documents/{document_id}` | `PATCH /api/v1/documents/{documentId}` | — | **Security fix**: only `filename` is editable; `status`/`fileType` not client-settable; `filename_key` recomputed and uniqueness enforced (`409 conflict`). |
| D7 | W3 | Backend→Engine | `DELETE /documents/{document_id}` | `DELETE /api/v1/documents/{documentId}` | E9 DELETE /internal/v1/documents/{documentId}/index via outbox document.deleted | Engine cleanup is retried and now also removes image files and parse artifacts. Response `data: null` (today `{ deleted_document_id }`). |

## Providers & model config

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| P1 | W2 | Backend | `POST /providers` | `POST /api/v1/providers` | — | Upsert kept. Response `providerMetadata` never includes the internal `catalog` (today it does on this route only). `keyPreview` = last 4 characters of the **plaintext** key, computed on write and stored in `model_providers.provider_metadata.keyPreview` (D22; today derived from the ciphertext). Existing rows get it from a one-off backfill that decrypts each key once. |
| P2 | W2 | Backend | `GET /providers` | `GET /api/v1/providers` | — | — |
| P3 | W2 | Backend | `GET /providers/{provider_type}` | `GET /api/v1/providers/{providerType}` | — | Invalid type → 400. |
| P4 | W2 | Backend | `DELETE /providers/{provider_type}` | `DELETE /api/v1/providers/{providerType}` | — | Response `{ providerType, resetAgentKeys }` camelCase. |
| P5 | W2 | Backend | `POST /providers/{provider_type}/validate` | `POST /api/v1/providers/{providerType}/validate` | — | Vendor `models.list` call runs in the backend (D13). `success` now reflects the HTTP call, `data.valid` the key (today `success` mirrored `valid`). |
| P6 | W2 | Backend | `GET /providers/{provider_type}/models` | `GET /api/v1/providers/{providerType}/models` | — | — |
| M1 | W2 | Backend | `GET /model-config` | `GET /api/v1/agent-model-configs` | — | Effective config keys camelCase (`keySource`, `isCustomModel`, `reasoningEffort`). |
| M2 | W2 | Backend | `GET /model-config/options` | `GET /api/v1/agent-model-configs/options` | — | — |
| M3 | W2 | Backend | `PATCH /model-config` | `PATCH /api/v1/agent-model-configs` | — | Validation errors → 400/422 with `data.errors` per agent key. |
| M4 | W2 | Backend | `POST /model-config/reset` | `POST /api/v1/agent-model-configs/reset` | — | — |

## MCP

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| X1 | W2 | Backend→Engine | `GET /mcp/servers` | `GET /api/v1/mcp-servers` | E13 GET /internal/v1/mcp/servers | **Security fix**: `env`/`headers` values redacted (`***` + `secretKeys`). |
| X2 | W2 | Removed | `GET /mcp/servers/{server_name}` | `— (use GET /api/v1/mcp-servers)` | E13 with serverName | Compat layer serves it from E13 with the `serverName` filter. |
| X3 | W2 | Backend→Engine | `POST /mcp/servers` | `POST /api/v1/mcp-servers` | E14 POST /internal/v1/mcp/servers | **Security fix**: `admin` only. `409 conflict` for existing/reserved names (today 400). Đã có ở code hiện tại (`f2ee28a8`): admin = danh sách `ADMIN_USER_IDS` trong env; transport stdio bị từ chối trừ khi `MCP_ALLOW_API_STDIO=true`. |
| X4 | W2 | Backend→Engine | `POST /mcp/servers/from-url` | `POST /api/v1/mcp-servers/from-url` | E15 | `admin` only. |
| X5 | W2 | Backend→Engine | `DELETE /mcp/servers/{server_name}` | `DELETE /api/v1/mcp-servers/{serverName}` | E16 | `admin` only; core server → `409 conflict` (today 400). |
| X6 | W2 | Backend→Engine | `PATCH /mcp/servers/{server_name}/toggle?enabled=` | `POST /api/v1/mcp-servers/{serverName}/toggle` | E17 | `admin` only; `enabled` in the body. |
| X7 | W2 | Backend→Engine | `GET /mcp/tools?serverName=` | `GET /api/v1/mcp-tools?serverName=` | E18 | Tools include `qualifiedToolId`. |
| X8 | W2 | Backend→Engine | `GET /mcp/servers/{server_name}/tools` | `GET /api/v1/mcp-tools?serverName={serverName}` | E18 | Folded into the filtered list. |
| X9 | W2 | Backend→Engine | `GET /mcp/tools/{tool_name}?serverName=` | `GET /api/v1/mcp-tools/{toolName}?serverName=` | E19 | — |
| X10 | W2 | Backend→Engine | `POST /mcp/tools/{tool_name}/execute` | `POST /api/v1/mcp-tools/{toolName}/execute` | E20 | **Security fix**: `admin` only; audited and usage-tracked; strict argument validation (400). Kiểm admin đã có ở `f2ee28a8` (ADMIN_USER_IDS). |

## Client devices & device runtime

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| C1 | W5 | Backend | `POST /client-devices/register` | `POST /api/v1/client-devices/register` | — (Redis client-runtime:issued-session:*) | Wrapped in the envelope (today unwrapped), camelCase body/response (`deviceIdentifier`, `displayName`, `sessionId`, …). Returns `wsUrl: "/ws/device-runtime/{deviceId}?sessionId=…"`. Bridge disabled → `503`. |
| C2 | W5 | Backend | `POST /client-devices/heartbeat (body device_id)` | `POST /api/v1/client-devices/{deviceId}/heartbeat` | — | Device id in the path. |
| C3 | W5 | Backend | `GET /client-devices/me` | `GET /api/v1/client-devices` | — | S1, S3; not paginated (small set). |
| C4 | W5 | Backend | `PUT /client-devices/{device_id}/tool-catalog` | `PUT /api/v1/client-devices/{deviceId}/tool-catalog` | — (Redis client-runtime:session:*) | Body `{ catalog }` (body `device_id` dropped). Malformed id → 400 (today 500). No live session → `409 conflict` (today 403). Stored catalog keys unchanged (engine reads them). |
| C5 | W5 | Backend | `PUT /client-devices/{device_id}/skill-catalog` | `PUT /api/v1/client-devices/{deviceId}/skill-catalog` | — | As C4. |
| C6 | W5 | Backend | `GET /client-devices/{device_id}` | `GET /api/v1/client-devices/{deviceId}` | — | S1, S3; malformed id → 400. |
| R1 | W5 | Backend | `WS /device-runtime/{device_id}/connect?session_id=` | `WS /ws/device-runtime/{deviceId}?sessionId=` | — (Redis client-runtime:request-queue/result-queue, engine dispatches) | WS gateway moves to the backend (D7). Frames unchanged (`ack`, `heartbeat`, `tool_request`, `tool_result`, `error`, snake_case per `runtime_protocol.py`). `session_id` query accepted as alias. On connect the backend expires stale client-tool `hitl_interrupts` (as today). |
| R2 | W5 | Backend | `GET /device-runtime/connected-devices` | `GET /api/v1/client-devices/connected` | — | **Security fix (D20)**: `sessionId` no longer exposed; items are `{ deviceId, connectedAt, lastHeartbeat, isAlive }`. |

## Widgets

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| W1r | W5 | Backend | `POST /widgets/{widget_id}/connection` | `POST /api/v1/widgets/{widgetId}/connection` | — (Redis widget:*) | Envelope (today raw object / `{ "error" }`), camelCase. `wsUrl` = `/ws/widgets/{widgetId}?sessionId=…&token=…` (root-relative). Widget token signed with the backend's own `WIDGET_TOKEN_SECRET` (no longer `SECRET_KEY`). |
| W2r | W5 | Backend | `POST /widgets/{widget_id}/actions/{action_key}` | `POST /api/v1/widgets/{widgetId}/actions/{actionKey}` | — | Body `{ inputValues?, statePatch? }` camelCase. Errors in the envelope. |
| W3r | W5 | Backend | `WS /widgets/{widget_id}/connect?session_id&token` | `WS /ws/widgets/{widgetId}?sessionId&token` | — | Frames unchanged (`widget_state_sync`, `widget_update`, `widget_close`, `ping`, `error`, `user_state_patch`, `pong`). `session_id` query accepted as alias. |

## Health & metrics

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| H1 | W6 | Engine only | `GET /health/conversation-compaction` | `— (part of GET /api/v1/health/dependencies)` | E21 checks.conversationCompaction | No longer public; the engine exposes it in E21 and its own `/metrics`. |
| H2 | W6 | Engine only | `GET /metrics/conversation-compaction` | `—` | engine /metrics (internal port, scraped by Prometheus) | Scraped directly from the engine. |
| H3 | W6 | Engine only | `GET /health/model-usage` | `— (part of /api/v1/health/dependencies)` | E21 checks.modelUsage | As H1. |
| H4 | W6 | Engine only | `GET /metrics/model-usage` | `—` | engine /metrics | As H2. |
| H5 | W6 | Engine only | `GET /metrics/rich-images` | `—` | engine /metrics | Web-image fetch counters (the `/web-images` fetch moved to the backend) are exported by the backend's `GET /api/v1/metrics`; generation-side counters stay in the engine. |
| H6 | W6 | Engine only | `GET /metrics/rag` | `—` | engine /metrics | As H2. |
| H7 | W6 | Engine only | `GET /metrics/routing` | `—` | engine /metrics | As H2. |
| H8 | W6 | Removed | `GET /` | `—` | — | Static banner dropped; docs at `/api/v1/docs`. |
| H9 | W6 | Backend | `GET /health` | `GET /api/v1/health` | — | **Public** liveness (D21), no dependency detail. Engine liveness is `GET /livez` on its internal port. |
| H10 | W6 | Backend→Engine | `GET /health/celery` | `GET /api/v1/health/dependencies` | E21 ?deep=true → checks.celery | Folded into one aggregate; requires `admin` or the internal network (D21; today public); non-blocking. |
| H11 | W6 | Backend | `GET /health/redis` | `GET /api/v1/health/dependencies` | — | Backend pings its own Redis connection. |
| H12 | W6 | Backend→Engine | `GET /health/qdrant` | `GET /api/v1/health/dependencies` | E21 checks.qdrant | Folded into the aggregate. |
| H13 | W6 | Backend→Engine | `GET /health/all` | `GET /api/v1/health/dependencies` | E21 | `{ status: healthy|degraded|unhealthy, services: { database, redis, objectStorage, engine: <E21 checks> } }`; 503 when unhealthy (today always 200). Requires `admin` or the internal network (D21). |
| H14 | W6 | Engine only | `GET /metrics/web-research` | `—` | engine /metrics | Metrics mới ở `aabb1beb`; Prometheus scrape trực tiếp từ Engine như H2–H7. |
| H15 | W6 | Backend | `GET /metrics/streaming` | `GET /api/v1/metrics (gộp)` | — | Mới ở `3a8baab3`…`5b9bb6ad` (15/10): metrics Prometheus của projector stream (operation chat/resume/continue, outcome). Khác H14: projector thuộc NestJS sau khi tách, nên metrics này do backend xuất, gộp vào `/api/v1/metrics`. |

## Projects

| # | Đợt | Bên xử lý | Hiện tại (FastAPI) | Mới (/api/v1) | Internal | Ghi chú |
|---|---|---|---|---|---|---|
| PJ1 | W1 | Backend | `GET /projects` | `GET /api/v1/projects` | — | Danh sách project của user, đã phân trang (`PaginatedApiResponse`). Áp S2 (meta mới) khi sang `/api/v1`. |
| PJ2 | W1 | Backend | `POST /projects` | `POST /api/v1/projects` | — | Tạo project (`name`, `description`, `instructions`). `201 created`. |
| PJ3 | W1 | Backend | `GET /projects/{project_id}` | `GET /api/v1/projects/{projectId}` | — | Không sở hữu / đã xoá → 404 (D15). |
| PJ4 | W1 | Backend | `PATCH /projects/{project_id}` | `PATCH /api/v1/projects/{projectId}` | — | Đổi `instructions` ảnh hưởng mọi lượt chat sau đó của các hội thoại trong project; không cần gọi Engine. |
| PJ5 | W1 | Backend | `DELETE /projects/{project_id}` | `DELETE /api/v1/projects/{projectId}` | — | Soft delete. Từ `cab22e26` xoá project còn gỡ mọi hội thoại (`project_id = NULL`) và xoá mềm `user_memories` của project trong cùng transaction: backend đang ghi bảng của Engine, sau khi tách phải qua outbox `project.deleted`. |
| PJ6 | W1 | Backend | `PUT /projects/{project_id}/conversations/{conversation_id}` | `PUT /api/v1/projects/{projectId}/conversations/{conversationId}` | — | Gắn hội thoại vào project (ghi `conversations.project_id`). Kiểm ownership cả hai phía. |
| PJ7 | W1 | Backend | `DELETE /projects/{project_id}/conversations/{conversation_id}` | `DELETE /api/v1/projects/{projectId}/conversations/{conversationId}` | — | Gỡ hội thoại khỏi project (set `project_id = NULL`). |
| PJ8 | W2 | Backend | `GET /projects/{project_id}/custom-agents` | `GET /api/v1/projects/{projectId}/custom-agents` | — | Danh sách custom agent theo `agent_order` (`project_custom_agents`). |
| PJ9 | W2 | Backend | `PUT /projects/{project_id}/custom-agents` | `PUT /api/v1/projects/{projectId}/custom-agents` | — | Thay cả tập agent có thứ tự. Từ `905e52f6` tập này đồng thời là allowlist: hội thoại trong project chỉ dùng agent có trong tập, tập rỗng nghĩa là không agent nào, gắn agent ngoài tập → 403. Agent mặc định được copy khi tạo hoặc gắn hội thoại; đổi tập không đồng bộ ngược vào hội thoại đã có. |

## Endpoint mới (§4.3)

| Mới | Bên xử lý | Đợt | Ghi chú |
|---|---|---|---|
| `GET /api/v1/metrics` | Backend | W6 | Prometheus text; requires `admin` or the internal network (D21), so Prometheus scrapes it from inside the cluster. |
| `GET /api/v1/admin/outbox-events` | Backend | W6 | `admin` only. |
| `POST /api/v1/admin/outbox-events/{eventId}/retry` | Backend | W6 | `admin` only. |
| `POST /internal/v1/documents/{documentId}/status (B1, internal listener)` | Backend | W3 | Engine callback. |
