# Database schema (nguồn: tài liệu Backend Split §6, metadata SQLAlchemy 905e52f6)

> Backend sở hữu 22 bảng hiện có + 2 bảng mới (`refresh_tokens`, `outbox_events`). Engine sở hữu 11 bảng + 4 bảng checkpoint.
> Tên cột snake_case GIỮ NGUYÊN. Không `synchronize`. Python không đặt DB default cho id/created_at/updated_at — app tự set.

## Bảng BACKEND sở hữu

### `agent_model_configs`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| user_id | UUID |  | FK users.id |
| agent_key | TEXT |  |  |
| provider_type | TEXT |  |  |
| model | TEXT |  |  |
| allow_custom_model | BOOLEAN |  |  |
| temperature | FLOAT | NULL |  |
| reasoning_effort | VARCHAR(32) | NULL |  |

- `UNIQUE INDEX idx_agent_model_configs_user_agent (user_id, agent_key)`

### `chat_images`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| conversation_id | UUID |  | INDEX, FK conversations.id |
| user_id | UUID |  | INDEX, FK users.id |
| sha256 | VARCHAR(64) |  |  |
| size_bytes | INTEGER |  |  |
| content_type | VARCHAR(128) |  |  |
| storage_path | VARCHAR(1024) |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |

- `INDEX ix_chat_images_conversation_id (conversation_id)`
- `UNIQUE INDEX uq_chat_images_user_sha256_live (user_id, sha256) WHERE deleted_at IS NULL`
- `INDEX ix_chat_images_user_id (user_id)`

### `client_devices`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| user_id | UUID |  | FK users.id |
| device_identifier | VARCHAR(255) |  | INDEX |
| display_name | VARCHAR(255) |  |  |
| platform | VARCHAR(64) |  |  |
| app_version | VARCHAR(64) | NULL |  |
| runtime_version | VARCHAR(64) | NULL |  |
| last_seen_at | TIMESTAMP WITH TIME ZONE |  | INDEX |
| status | enum device_status (online | offline | idle) |  | INDEX |
| capabilities_json | JSONB |  |  |

- `UNIQUE uq_client_devices_user_device_id (user_id, device_identifier)`
- `INDEX ix_client_devices_status (status)`
- `INDEX ix_client_devices_last_seen_at (last_seen_at)`
- `INDEX ix_client_devices_device_identifier (device_identifier)`

### `conversation_custom_agents`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| owner_id | UUID |  | FK users.id |
| conversation_id | UUID |  | FK conversations.id |
| custom_agent_id | UUID |  | FK custom_agents.id |
| agent_order | INTEGER |  |  |

- `UNIQUE uq_conversation_custom_agents_conv_agent (conversation_id, custom_agent_id)`
- `INDEX ix_conversation_custom_agents_owner_conv (owner_id, conversation_id)`
- `INDEX ix_conversation_custom_agents_custom_agent_id (custom_agent_id)`

### `conversations`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| owner_id | UUID |  | INDEX, FK users.id |
| title | VARCHAR(255) |  |  |
| persona_prompt | TEXT | NULL |  |
| planning_mode_enabled | BOOLEAN |  |  |
| next_message_sequence | BIGINT |  |  |
| plan_lifecycle | VARCHAR(20) | NULL |  |
| project_id | UUID | NULL | INDEX, FK projects.id |
| forked_from_conversation_id | UUID | NULL | INDEX, FK conversations.id ON DELETE SET NULL |
| forked_from_message_id | UUID | NULL | INDEX, FK messages.id ON DELETE SET NULL |
| forked_through_sequence | BIGINT | NULL |  |
| fork_request_id | UUID | NULL |  |
| fork_request_fingerprint | VARCHAR(64) | NULL |  |

- `CHECK ck_conversations_fork_request_fields_together`
- `CHECK ck_conversations_next_message_sequence_positive`
- `CHECK ck_conversations_forked_through_sequence_positive`
- `UNIQUE uq_conversations_owner_fork_request (owner_id, fork_request_id)`
- `INDEX ix_conversations_forked_from_conversation_id (forked_from_conversation_id)`
- `INDEX ix_conversations_forked_from_message_id (forked_from_message_id)`
- `INDEX ix_conversations_project_id (project_id)`
- `INDEX ix_conversations_owner_id (owner_id)`
- `INDEX ix_conversations_project_updated (project_id, updated_at) WHERE deleted_at IS NULL`

### `custom_agents`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| owner_id | UUID |  | FK users.id |
| name | VARCHAR(255) |  |  |
| slug | VARCHAR(255) |  |  |
| description | TEXT | NULL |  |
| prompt | TEXT |  |  |
| provider_type | VARCHAR(64) |  |  |
| model | VARCHAR(255) |  |  |
| temperature | FLOAT | NULL |  |
| reasoning_effort | VARCHAR(32) | NULL |  |
| tool_refs | JSONB |  |  |
| skill_refs | JSONB |  |  |
| enabled | BOOLEAN |  |  |

- `INDEX ix_custom_agents_owner_deleted (owner_id, deleted_at)`
- `UNIQUE INDEX uq_custom_agents_owner_slug_active (owner_id, slug) WHERE deleted_at IS NULL`

### `documents`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| conversation_id | UUID |  | FK conversations.id |
| filename | VARCHAR(255) |  |  |
| filename_key | VARCHAR(255) |  |  |
| file_type | VARCHAR(100) |  |  |
| status | INTEGER |  |  |
| upload_time | TIMESTAMP WITH TIME ZONE |  |  |
| processing_task_id | VARCHAR(255) | NULL |  |

- `UNIQUE uq_documents_conversation_filename_key (conversation_id, filename_key)`
- `INDEX idx_document_processing_task_id (processing_task_id)`

### `feedbacks`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| message_id | UUID |  | UNIQUE, INDEX, FK messages.id |
| user_id | UUID |  | INDEX, FK users.id |
| rating | SMALLINT |  |  |
| comment | TEXT | NULL |  |

- `CHECK ck_feedbacks_rating_range`
- `UNIQUE INDEX ix_feedbacks_message_id (message_id)`
- `INDEX ix_feedbacks_user_id (user_id)`

### `generation_commands`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| completed_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| generation_id | UUID |  | INDEX, FK generations.id ON DELETE CASCADE |
| idempotency_key | VARCHAR(160) |  |  |
| action | enum generation_command_action (stop | continue) |  |  |
| fence | INTEGER |  |  |
| result | JSONB | NULL |  |

- `UNIQUE INDEX uq_generation_commands_key (generation_id, idempotency_key)`
- `INDEX ix_generation_commands_generation_id (generation_id)`

### `generations`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| terminal_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| logical_turn_id | VARCHAR(160) |  |  |
| checkpoint_thread_id | VARCHAR(320) |  |  |
| producer_token | VARCHAR(255) | NULL |  |
| user_id | UUID |  | FK users.id |
| conversation_id | UUID |  | INDEX, FK conversations.id |
| status | enum generation_status (starting | running | finalizing_after_limit | continuable | continuing | stop_requested | stopped | completed | completed_partial | failed) |  |  |
| version | INTEGER |  |  |
| execution_epoch | INTEGER |  |  |
| active_agent_id | VARCHAR(160) | NULL |  |
| terminal_reason | VARCHAR(128) | NULL |  |
| execution_budget | JSONB | NULL |  |
| research_accounting | JSONB | NULL |  |
| assistant_message_id | UUID | NULL | FK messages.id ON DELETE SET NULL |
| continuation_id | UUID | NULL |  |
| continuation_available | BOOLEAN |  |  |
| continuation_block_reason | VARCHAR(128) | NULL |  |

- `INDEX ix_generations_checkpoint_thread (checkpoint_thread_id)`
- `UNIQUE INDEX uq_generations_active_per_conversation (conversation_id) WHERE status IN ('continuing', 'finalizing_after_limit', 'running', 'starting', 'stop_requested')`
- `INDEX ix_generations_conversation_id (conversation_id)`
- `INDEX ix_generations_continuation_id (continuation_id)`
- `INDEX ix_generations_assistant_message_id (assistant_message_id)`
- `UNIQUE INDEX uq_generations_logical_turn_id (logical_turn_id)`
- `INDEX ix_generations_owner_status (user_id, status)`

### `hitl_interrupts`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | VARCHAR(255) |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| conversation_id | UUID |  | INDEX, FK conversations.id |
| user_id | UUID |  | INDEX, FK users.id |
| thread_id | VARCHAR(255) |  | INDEX |
| assistant_message_id | UUID | NULL | INDEX, FK messages.id |
| status | enum hitl_interrupt_status (pending | resolving | failed | resolved | expired) |  | INDEX |
| expires_at | TIMESTAMP WITH TIME ZONE |  | INDEX |
| resolved_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| resolved_by_user_id | UUID | NULL | INDEX, FK users.id ON DELETE SET NULL |
| resolution_source | VARCHAR(50) | NULL |  |
| action_requests_json | JSONB |  |  |
| device_id | UUID | NULL | INDEX, FK client_devices.id |
| interrupt_metadata_json | JSONB |  |  |
| session_id | VARCHAR(255) | NULL | INDEX |
| catalog_version | INTEGER | NULL |  |
| tool_instance_id | VARCHAR(64) | NULL |  |

- `INDEX ix_hitl_interrupts_thread_id (thread_id)`
- `INDEX ix_hitl_interrupts_expires_at (expires_at)`
- `INDEX ix_hitl_interrupts_resolved_by_user_id (resolved_by_user_id)`
- `INDEX ix_hitl_interrupts_session_id (session_id)`
- `INDEX ix_hitl_interrupts_user_id (user_id)`
- `INDEX ix_hitl_interrupts_conversation_id (conversation_id)`
- `INDEX ix_hitl_interrupts_assistant_message_id (assistant_message_id)`
- `INDEX ix_hitl_interrupts_device_id (device_id)`
- `INDEX ix_hitl_interrupts_status (status)`

### `messages`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| conversation_id | UUID |  | FK conversations.id |
| sender | INTEGER |  |  |
| content | TEXT |  |  |
| message_metadata | JSONB | NULL |  |
| sequence | BIGINT |  |  |

- `CHECK ck_messages_sequence_positive`
- `UNIQUE uq_messages_conversation_sequence (conversation_id, sequence)`
- `INDEX ix_messages_prompt_history (conversation_id, sequence) WHERE deleted_at IS NULL`
- `INDEX idx_message_conversation_created (conversation_id, created_at)`
- `INDEX idx_messages_content_simple_fts (expr)`

### `model_providers`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| user_id | UUID |  | FK users.id |
| provider_type | TEXT |  |  |
| api_key_encrypted | TEXT |  |  |
| is_default | BOOLEAN |  |  |
| provider_metadata | JSONB | NULL |  |

- `INDEX idx_model_providers_user_default (user_id, is_default) WHERE model_providers.is_default`
- `INDEX idx_model_providers_user_id (user_id)`
- `UNIQUE INDEX idx_model_providers_user_type (user_id, provider_type) WHERE model_providers.deleted_at IS NULL`

### `project_custom_agents`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| owner_id | UUID |  | FK users.id |
| project_id | UUID |  | FK projects.id |
| custom_agent_id | UUID |  | FK custom_agents.id |
| agent_order | INTEGER |  |  |

- `UNIQUE uq_project_custom_agents_project_agent (project_id, custom_agent_id)`
- `INDEX ix_project_custom_agents_custom_agent_id (custom_agent_id)`
- `INDEX ix_project_custom_agents_owner_project (owner_id, project_id)`

### `projects`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| owner_id | UUID |  | FK users.id |
| name | VARCHAR(255) |  |  |
| description | TEXT | NULL |  |
| instructions | TEXT | NULL |  |

- `INDEX ix_projects_owner_deleted (owner_id, deleted_at)`

### `server_secrets`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| name | VARCHAR(64) |  | PK |
| value | TEXT |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |

### `skill_settings`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| user_id | UUID |  | FK users.id |
| skill_name | VARCHAR(255) |  | INDEX |
| enabled | BOOLEAN |  |  |

- `UNIQUE uq_skill_settings_user_skill (user_id, skill_name)`
- `INDEX ix_skill_settings_skill_name (skill_name)`

### `task_plans`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| conversation_id | UUID |  | FK conversations.id |
| task_order | INTEGER |  |  |
| description | TEXT |  |  |
| status | enum task_status (pending | in_progress | completed | skipped) |  |  |
| task_metadata | JSONB | NULL |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| completed_at | TIMESTAMP WITH TIME ZONE | NULL |  |

- `UNIQUE uq_task_plan_conversation_order (conversation_id, task_order) DEFERRABLE`

### `tool_approval_settings`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| user_id | UUID |  | FK users.id |
| device_id | UUID |  | INDEX, FK client_devices.id ON DELETE CASCADE |
| tool_origin | VARCHAR(32) |  | INDEX |
| scope_type | VARCHAR(16) |  |  |
| scope_value | VARCHAR(512) |  | INDEX |
| require_approval | BOOLEAN |  |  |

- `CHECK ck_tool_approval_settings_scope_type`
- `UNIQUE uq_tool_approval_settings_user_device_origin_scope (user_id, device_id, tool_origin, scope_type, scope_value)`
- `CHECK ck_tool_approval_settings_tool_origin`
- `INDEX ix_tool_approval_settings_tool_origin (tool_origin)`
- `INDEX ix_tool_approval_settings_scope_value (scope_value)`
- `INDEX ix_tool_approval_settings_device_id (device_id)`

### `tool_approvals`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| conversation_id | UUID |  | INDEX, FK conversations.id |
| user_id | UUID |  | INDEX, FK users.id |
| interrupt_id | VARCHAR(255) |  | INDEX |
| tool_name | VARCHAR(255) |  |  |
| tool_call_id | VARCHAR(255) |  |  |
| original_args | JSONB |  |  |
| modified_args | JSONB | NULL |  |
| decision | enum decision_type (accept | edit | reject | respond) |  |  |
| decided_at | TIMESTAMP WITH TIME ZONE |  | INDEX |
| device_id | UUID | NULL | INDEX, FK client_devices.id |
| tool_origin | VARCHAR(32) | NULL | INDEX |
| server_name | VARCHAR(255) | NULL |  |
| qualified_tool_id | VARCHAR(512) | NULL | INDEX |
| session_id | VARCHAR(255) | NULL | INDEX |
| catalog_version | INTEGER | NULL |  |
| tool_instance_id | VARCHAR(64) | NULL | INDEX |

- `INDEX ix_tool_approvals_decided_at (decided_at)`
- `INDEX ix_tool_approvals_qualified_tool_id (qualified_tool_id)`
- `INDEX ix_tool_approvals_interrupt_id (interrupt_id)`
- `INDEX ix_tool_approvals_conversation_id (conversation_id)`
- `INDEX ix_tool_approvals_device_id (device_id)`
- `INDEX ix_tool_approvals_user_id (user_id)`
- `INDEX ix_tool_approvals_session_id (session_id)`
- `INDEX ix_tool_approvals_tool_instance_id (tool_instance_id)`
- `INDEX ix_tool_approvals_tool_origin (tool_origin)`

### `users`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| username | VARCHAR(50) |  | UNIQUE, INDEX |
| email | VARCHAR(255) |  | UNIQUE, INDEX |
| password_hash | TEXT |  |  |
| avatar_url | VARCHAR(2048) | NULL |  |
| token_version | INTEGER |  |  |

- `UNIQUE INDEX ix_users_email (email)`
- `UNIQUE INDEX ix_users_username (username)`

### `web_image_references`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| conversation_id | UUID |  | INDEX, FK conversations.id |
| user_id | UUID |  | INDEX, FK users.id |
| upstream_url | VARCHAR(4096) |  |  |
| expected_mime | VARCHAR(128) | NULL |  |
| provider | VARCHAR(32) |  |  |
| content | BYTEA | NULL |  |
| cached_width | INTEGER | NULL |  |
| cached_height | INTEGER | NULL |  |
| lifecycle_state | VARCHAR(16) |  | INDEX |
| expires_at | TIMESTAMP WITH TIME ZONE | NULL | INDEX |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |

- `CHECK ck_web_image_references_lifecycle_state`
- `INDEX ix_web_image_references_user_id (user_id)`
- `INDEX ix_web_image_references_conversation_id (conversation_id)`
- `INDEX ix_web_image_references_expires_at (expires_at)`
- `INDEX ix_web_image_references_lifecycle_state (lifecycle_state)`

## Bảng ENGINE sở hữu (backend không ghi)

### `conversation_memory_summaries`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| conversation_id | UUID |  | PK, FK conversations.id ON DELETE CASCADE, FK messages.conversation_id |
| summary_payload | JSONB |  |  |
| summary_schema_version | SMALLINT |  |  |
| last_summarized_sequence | BIGINT | NULL | FK messages.sequence |
| summary_version | BIGINT |  |  |
| source_message_count | INTEGER |  |  |
| source_token_count | INTEGER |  |  |
| summary_token_count | INTEGER |  |  |
| provider | VARCHAR(64) |  |  |
| model | VARCHAR(255) |  |  |
| tokenizer | VARCHAR(128) |  |  |
| prompt_version | VARCHAR(64) |  |  |
| is_valid | BOOLEAN |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |

- `CHECK ck_memory_summary_source_message_count_nonnegative`
- `CHECK ck_memory_summary_source_token_count_nonnegative`
- `CHECK ck_memory_summary_version_positive`
- `CHECK ck_memory_summary_token_count_nonnegative`
- `CHECK ck_memory_summary_schema_version_positive`
- `FK fk_memory_summary_conversation_sequence (conversation_id, last_summarized_sequence) → messages`

### `conversation_summary_jobs`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| conversation_id | UUID |  | PK, FK conversations.id ON DELETE CASCADE, FK messages.conversation_id |
| requested_through_sequence | BIGINT |  | FK messages.sequence |
| status | VARCHAR(16) |  |  |
| attempt_count | INTEGER |  |  |
| available_at | TIMESTAMP WITH TIME ZONE |  |  |
| lease_token | UUID | NULL |  |
| lease_expires_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| last_error_code | VARCHAR(64) | NULL |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |

- `FK fk_summary_job_conversation_sequence (conversation_id, requested_through_sequence) → messages`
- `CHECK ck_summary_jobs_status`
- `CHECK ck_summary_jobs_attempt_count_nonnegative`
- `INDEX ix_summary_jobs_due (status, available_at)`

### `document_chunks`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| document_id | UUID |  | FK documents.id ON DELETE CASCADE |
| index_generation_id | UUID |  | FK document_index_generations.id ON DELETE CASCADE |
| parse_artifact_id | UUID | NULL | FK document_parse_artifacts.id ON DELETE SET NULL |
| qdrant_point_id | VARCHAR(100) | NULL | UNIQUE |
| chunk_index | INTEGER |  |  |
| content | TEXT |  |  |
| content_sha256 | VARCHAR(64) |  |  |
| char_count | INTEGER |  |  |
| token_count | INTEGER |  |  |
| page_start | INTEGER | NULL |  |
| page_end | INTEGER | NULL |  |
| section_path | JSONB |  |  |
| block_provenance | JSONB |  |  |
| chunk_metadata | JSONB |  |  |
| index_status | VARCHAR(32) |  |  |
| index_error | TEXT | NULL |  |
| indexed_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| embedding_model | VARCHAR | NULL |  |
| embedding_dimension | INTEGER | NULL |  |
| qdrant_collection_name | VARCHAR | NULL |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |

- `UNIQUE None (qdrant_point_id)`
- `UNIQUE uq_document_chunk_generation_index (document_id, index_generation_id, chunk_index)`
- `CHECK ck_document_chunks_index_status`
- `INDEX idx_document_chunks_content_sha256 (content_sha256)`
- `INDEX idx_document_chunks_index_generation_id (index_generation_id)`
- `INDEX idx_document_chunks_content_simple_fts (expr)`
- `INDEX idx_document_chunks_parse_artifact_id (parse_artifact_id)`
- `INDEX idx_document_chunks_index_status (index_status)`

### `document_images`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| document_id | UUID |  | FK documents.id |
| chunk_id | UUID | NULL | FK document_chunks.id ON DELETE SET NULL |
| image_path | VARCHAR(500) |  |  |
| image_caption | TEXT | NULL |  |
| page_number | INTEGER | NULL |  |
| mime_type | VARCHAR(50) |  |  |
| bbox | JSONB | NULL |  |
| section_path | JSONB |  |  |
| content_sha256 | VARCHAR(64) | NULL |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |

- `INDEX idx_document_images_content_sha256 (content_sha256)`
- `INDEX idx_document_images_document_id (document_id)`
- `INDEX idx_document_images_chunk_id (chunk_id)`

### `document_index_generations`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| document_id | UUID |  | FK documents.id ON DELETE CASCADE |
| status | VARCHAR(16) |  |  |
| embedding_provider | VARCHAR(64) |  |  |
| embedding_model | VARCHAR(255) |  |  |
| embedding_dimension | INTEGER |  |  |
| chunking_version | VARCHAR(64) |  |  |
| failure_code | VARCHAR(64) | NULL |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| activated_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| retired_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| failed_at | TIMESTAMP WITH TIME ZONE | NULL |  |

- `CHECK ck_document_index_generations_status`
- `INDEX idx_document_index_generations_status (status)`
- `UNIQUE INDEX uq_document_index_generation_active (document_id) WHERE status = 'active'`
- `INDEX idx_document_index_generations_document (document_id)`

### `document_parse_artifacts`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| document_id | UUID |  | FK documents.id |
| artifact_type | VARCHAR(64) |  | INDEX |
| storage_path | VARCHAR(1024) |  |  |
| mime_type | VARCHAR(255) | NULL |  |
| size_bytes | INTEGER | NULL |  |
| checksum_sha256 | VARCHAR(128) | NULL |  |
| artifact_metadata | JSONB |  |  |

- `UNIQUE uq_document_parse_artifact_path (document_id, artifact_type, storage_path)`
- `INDEX ix_document_parse_artifacts_artifact_type (artifact_type)`

### `model_usage_events`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| event_key | VARCHAR(160) |  |  |
| operation_id | UUID |  |  |
| attempt | INTEGER |  |  |
| user_id | UUID | NULL | FK users.id ON DELETE CASCADE |
| conversation_id | UUID | NULL | FK conversations.id ON DELETE CASCADE |
| request_message_id | UUID | NULL | FK messages.id ON DELETE SET NULL |
| document_id | UUID | NULL | FK documents.id ON DELETE SET NULL |
| correlation_id | VARCHAR(128) | NULL |  |
| langsmith_run_id | UUID | NULL |  |
| provider_request_id | VARCHAR(255) | NULL |  |
| provider | VARCHAR(32) |  |  |
| model | VARCHAR(255) |  |  |
| operation | VARCHAR(64) |  |  |
| agent_id | VARCHAR(128) | NULL |  |
| status | VARCHAR(16) |  |  |
| usage_source | VARCHAR(32) |  |  |
| input_tokens | BIGINT | NULL |  |
| output_tokens | BIGINT | NULL |  |
| total_tokens | BIGINT | NULL |  |
| reasoning_tokens | BIGINT | NULL |  |
| cached_input_tokens | BIGINT | NULL |  |
| input_text_tokens | BIGINT | NULL |  |
| input_image_tokens | BIGINT | NULL |  |
| output_text_tokens | BIGINT | NULL |  |
| output_image_tokens | BIGINT | NULL |  |
| generated_images | INTEGER |  |  |
| latency_ms | BIGINT |  |  |
| error_code | VARCHAR(128) | NULL |  |
| started_at | TIMESTAMP WITH TIME ZONE |  |  |
| completed_at | TIMESTAMP WITH TIME ZONE |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |

- `CHECK ck_model_usage_events_generated_images_nonnegative`
- `CHECK ck_model_usage_events_output_tokens_nonnegative`
- `CHECK ck_model_usage_events_cached_input_tokens_nonnegative`
- `CHECK ck_model_usage_events_latency_ms_nonnegative`
- `CHECK ck_model_usage_events_output_text_tokens_nonnegative`
- `CHECK ck_model_usage_events_total_tokens_nonnegative`
- `UNIQUE uq_model_usage_events_event_key (event_key)`
- `UNIQUE uq_model_usage_events_operation_attempt (operation_id, attempt)`
- `CHECK ck_model_usage_events_input_text_tokens_nonnegative`
- `CHECK ck_model_usage_events_output_image_tokens_nonnegative`
- `CHECK ck_model_usage_events_input_tokens_nonnegative`
- `CHECK ck_model_usage_events_reasoning_tokens_nonnegative`
- `CHECK ck_model_usage_events_attempt_positive`
- `CHECK ck_model_usage_events_input_image_tokens_nonnegative`
- `INDEX ix_model_usage_events_provider_model_started (provider, model, started_at)`
- `INDEX ix_model_usage_events_started_at (started_at)`
- `INDEX ix_model_usage_events_user_started (user_id, started_at)`
- `INDEX ix_model_usage_events_operation_started (operation, started_at)`
- `INDEX ix_model_usage_events_document_id (document_id)`
- `INDEX ix_model_usage_events_conversation_started (conversation_id, started_at)`
- `INDEX ix_model_usage_events_request_message_id (request_message_id)`

### `model_usage_minute`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| rollup_key | VARCHAR(64) |  | PK |
| bucket_start_utc | TIMESTAMP WITH TIME ZONE |  |  |
| user_id | UUID | NULL | FK users.id ON DELETE CASCADE |
| conversation_id | UUID | NULL | FK conversations.id ON DELETE CASCADE |
| provider | VARCHAR(32) |  |  |
| model | VARCHAR(255) |  |  |
| operation | VARCHAR(64) |  |  |
| agent_id | VARCHAR(128) | NULL |  |
| status | VARCHAR(16) |  |  |
| usage_source | VARCHAR(32) |  |  |
| input_tokens_sum | BIGINT |  |  |
| input_tokens_known_count | BIGINT |  |  |
| output_tokens_sum | BIGINT |  |  |
| output_tokens_known_count | BIGINT |  |  |
| total_tokens_sum | BIGINT |  |  |
| total_tokens_known_count | BIGINT |  |  |
| reasoning_tokens_sum | BIGINT |  |  |
| reasoning_tokens_known_count | BIGINT |  |  |
| cached_input_tokens_sum | BIGINT |  |  |
| cached_input_tokens_known_count | BIGINT |  |  |
| input_text_tokens_sum | BIGINT |  |  |
| input_text_tokens_known_count | BIGINT |  |  |
| input_image_tokens_sum | BIGINT |  |  |
| input_image_tokens_known_count | BIGINT |  |  |
| output_text_tokens_sum | BIGINT |  |  |
| output_text_tokens_known_count | BIGINT |  |  |
| output_image_tokens_sum | BIGINT |  |  |
| output_image_tokens_known_count | BIGINT |  |  |
| generated_images_sum | BIGINT |  |  |
| request_count | BIGINT |  |  |
| latency_ms_sum | BIGINT |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |

- `CHECK ck_mu_minute_input_tokens_sum_nonneg`
- `CHECK ck_mu_minute_total_tokens_sum_nonneg`
- `CHECK ck_mu_minute_input_image_tokens_sum_nonneg`
- `CHECK ck_mu_minute_latency_ms_sum_nonneg`
- `CHECK ck_mu_minute_input_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_output_text_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_reasoning_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_input_text_tokens_sum_nonneg`
- `CHECK ck_mu_minute_generated_images_sum_nonneg`
- `CHECK ck_mu_minute_input_image_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_cached_input_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_output_tokens_sum_nonneg`
- `CHECK ck_mu_minute_output_image_tokens_sum_nonneg`
- `CHECK ck_mu_minute_total_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_cached_input_tokens_sum_nonneg`
- `CHECK ck_mu_minute_input_text_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_request_count_nonneg`
- `CHECK ck_mu_minute_output_tokens_known_count_nonneg`
- `CHECK ck_mu_minute_output_text_tokens_sum_nonneg`
- `CHECK ck_mu_minute_reasoning_tokens_sum_nonneg`
- `CHECK ck_mu_minute_output_image_tokens_known_count_nonneg`
- `INDEX ix_model_usage_minute_conversation_bucket (conversation_id, bucket_start_utc)`
- `INDEX ix_model_usage_minute_user_bucket (user_id, bucket_start_utc)`
- `INDEX ix_model_usage_minute_bucket_start_utc (bucket_start_utc)`

### `tool_execution_receipts`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| completed_at | TIMESTAMP WITH TIME ZONE | NULL |  |
| execution_key | VARCHAR(64) |  |  |
| status | enum tool_execution_receipt_status (reserved | completed | failed | outcome_unknown) |  |  |
| user_id | UUID |  | FK users.id |
| conversation_id | UUID |  | FK conversations.id |
| turn_id | VARCHAR(160) |  |  |
| thread_id | VARCHAR(320) |  | INDEX |
| dispatch_id | VARCHAR(64) |  |  |
| task_id | VARCHAR(160) |  |  |
| tool_call_id | VARCHAR(255) |  |  |
| qualified_tool_id | VARCHAR(512) |  | INDEX |
| provider_idempotency | BOOLEAN |  |  |
| result_json | JSONB | NULL |  |
| artifact_ref | VARCHAR(512) | NULL |  |
| provider_receipt_id | VARCHAR(255) | NULL |  |
| error_code | VARCHAR(128) | NULL |  |

- `UNIQUE INDEX uq_tool_execution_receipts_execution_key (execution_key)`
- `INDEX ix_tool_execution_receipts_owner_status (user_id, status)`
- `INDEX ix_tool_execution_receipts_qualified_tool_id (qualified_tool_id)`
- `INDEX ix_tool_execution_receipts_conversation_turn (conversation_id, turn_id)`
- `INDEX ix_tool_execution_receipts_thread_id (thread_id)`

### `tool_result_blobs`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| conversation_id | UUID |  | INDEX, FK conversations.id |
| user_id | UUID |  | INDEX, FK users.id |
| tool_call_id | VARCHAR(255) | NULL | INDEX |
| tool_name | VARCHAR(255) |  | INDEX |
| storage_path | VARCHAR(1024) | NULL |  |
| content | TEXT | NULL |  |
| sha256 | VARCHAR(64) |  |  |
| size_bytes | INTEGER |  |  |
| content_type | VARCHAR(128) |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |

- `INDEX ix_tool_result_blobs_user_id (user_id)`
- `INDEX ix_tool_result_blobs_tool_call_id (tool_call_id)`
- `INDEX ix_tool_result_blobs_tool_name (tool_name)`
- `INDEX ix_tool_result_blobs_conversation_id (conversation_id)`

### `user_memories`

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| id | UUID |  | PK |
| user_id | UUID |  | INDEX, FK users.id |
| project_id | UUID | NULL | FK projects.id ON DELETE SET NULL |
| content | TEXT |  |  |
| source | VARCHAR(255) |  |  |
| created_at | TIMESTAMP WITH TIME ZONE |  |  |
| updated_at | TIMESTAMP WITH TIME ZONE |  |  |
| deleted_at | TIMESTAMP WITH TIME ZONE | NULL |  |

- `INDEX ix_user_memories_user_id (user_id)`
- `INDEX ix_user_memories_user_project (user_id, project_id, deleted_at)`
- `INDEX ix_user_memories_project_id (project_id)`

