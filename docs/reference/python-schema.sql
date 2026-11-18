--
-- PostgreSQL database dump
--

\restrict aFDVEnUghI0gcbn7m4tmc9KB2dcR50hCfoUnie3ckL2uLUSRSeGm4D3wLNAV8Og


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: decision_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.decision_type AS ENUM (
    'accept',
    'edit',
    'reject',
    'respond'
);


--
-- Name: generation_command_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.generation_command_action AS ENUM (
    'stop',
    'continue'
);


--
-- Name: generation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.generation_status AS ENUM (
    'starting',
    'running',
    'finalizing_after_limit',
    'continuable',
    'continuing',
    'stop_requested',
    'stopped',
    'completed',
    'completed_partial',
    'failed'
);


--
-- Name: hitl_interrupt_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.hitl_interrupt_status AS ENUM (
    'pending',
    'resolving',
    'resolved',
    'expired',
    'failed'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'skipped'
);


--
-- Name: tool_execution_receipt_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_execution_receipt_status AS ENUM (
    'reserved',
    'completed',
    'failed',
    'outcome_unknown'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_model_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_model_configs (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    agent_key text NOT NULL,
    provider_type text NOT NULL,
    model text NOT NULL,
    temperature double precision,
    allow_custom_model boolean NOT NULL,
    reasoning_effort character varying(32)
);


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: chat_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    sha256 character varying(64) NOT NULL,
    size_bytes integer NOT NULL,
    content_type character varying(128) DEFAULT 'image/png'::character varying NOT NULL,
    storage_path character varying(1024) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: client_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_devices (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    device_identifier character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    platform character varying(64) DEFAULT 'windows'::character varying NOT NULL,
    app_version character varying(64),
    runtime_version character varying(64),
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(32) DEFAULT 'offline'::character varying NOT NULL,
    capabilities_json jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: conversation_custom_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_custom_agents (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    custom_agent_id uuid NOT NULL,
    agent_order integer DEFAULT 0 NOT NULL
);


--
-- Name: conversation_memory_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_memory_summaries (
    conversation_id uuid NOT NULL,
    summary_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary_schema_version smallint DEFAULT 1 NOT NULL,
    last_summarized_sequence bigint,
    summary_version bigint DEFAULT 1 NOT NULL,
    source_message_count integer DEFAULT 0 NOT NULL,
    source_token_count integer DEFAULT 0 NOT NULL,
    summary_token_count integer DEFAULT 0 NOT NULL,
    provider character varying(64) DEFAULT ''::character varying NOT NULL,
    model character varying(255) DEFAULT ''::character varying NOT NULL,
    tokenizer character varying(128) DEFAULT ''::character varying NOT NULL,
    prompt_version character varying(64) DEFAULT ''::character varying NOT NULL,
    is_valid boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_memory_summary_schema_version_positive CHECK ((summary_schema_version > 0)),
    CONSTRAINT ck_memory_summary_source_message_count_nonnegative CHECK ((source_message_count >= 0)),
    CONSTRAINT ck_memory_summary_source_token_count_nonnegative CHECK ((source_token_count >= 0)),
    CONSTRAINT ck_memory_summary_token_count_nonnegative CHECK ((summary_token_count >= 0)),
    CONSTRAINT ck_memory_summary_version_positive CHECK ((summary_version > 0))
);


--
-- Name: conversation_summary_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_summary_jobs (
    conversation_id uuid NOT NULL,
    requested_through_sequence bigint NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    last_error_code character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_summary_jobs_attempt_count_nonnegative CHECK ((attempt_count >= 0)),
    CONSTRAINT ck_summary_jobs_status CHECK (((status)::text = ANY ((ARRAY['idle'::character varying, 'pending'::character varying, 'processing'::character varying, 'retry'::character varying, 'dead'::character varying])::text[])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    owner_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    persona_prompt text,
    planning_mode_enabled boolean DEFAULT false NOT NULL,
    plan_lifecycle character varying(20),
    next_message_sequence bigint DEFAULT 1 NOT NULL,
    project_id uuid,
    forked_from_conversation_id uuid,
    forked_from_message_id uuid,
    forked_through_sequence bigint,
    fork_request_id uuid,
    fork_request_fingerprint character varying(64),
    CONSTRAINT ck_conversations_fork_request_fields_together CHECK (((fork_request_id IS NULL) = (fork_request_fingerprint IS NULL))),
    CONSTRAINT ck_conversations_forked_through_sequence_positive CHECK (((forked_through_sequence IS NULL) OR (forked_through_sequence > 0))),
    CONSTRAINT ck_conversations_next_message_sequence_positive CHECK ((next_message_sequence > 0))
);


--
-- Name: custom_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_agents (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    owner_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    prompt text NOT NULL,
    provider_type character varying(64) NOT NULL,
    model character varying(255) NOT NULL,
    temperature double precision,
    reasoning_effort character varying(32),
    tool_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    skill_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_chunks (
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    qdrant_point_id character varying(100),
    chunk_index integer NOT NULL,
    token_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    content text NOT NULL,
    content_sha256 character varying(64) NOT NULL,
    char_count integer NOT NULL,
    parse_artifact_id uuid,
    page_start integer,
    page_end integer,
    section_path jsonb NOT NULL,
    block_provenance jsonb NOT NULL,
    chunk_metadata jsonb NOT NULL,
    index_status character varying(32) NOT NULL,
    index_error text,
    indexed_at timestamp with time zone,
    embedding_model character varying,
    embedding_dimension integer,
    qdrant_collection_name character varying,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    index_generation_id uuid NOT NULL,
    CONSTRAINT ck_document_chunks_index_status CHECK (((index_status)::text = ANY ((ARRAY['pending'::character varying, 'indexed'::character varying, 'failed'::character varying, 'needs_reindex'::character varying])::text[])))
);


--
-- Name: document_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_images (
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    chunk_id uuid,
    image_path character varying(500) NOT NULL,
    image_caption text,
    page_number integer,
    mime_type character varying(50) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    bbox jsonb,
    section_path jsonb DEFAULT '[]'::jsonb NOT NULL,
    content_sha256 character varying(64)
);


--
-- Name: document_index_generations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_index_generations (
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    status character varying(16) NOT NULL,
    embedding_provider character varying(64) NOT NULL,
    embedding_model character varying(255) NOT NULL,
    embedding_dimension integer NOT NULL,
    chunking_version character varying(64) NOT NULL,
    failure_code character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    retired_at timestamp with time zone,
    failed_at timestamp with time zone,
    CONSTRAINT ck_document_index_generations_status CHECK (((status)::text = ANY ((ARRAY['building'::character varying, 'ready'::character varying, 'active'::character varying, 'retired'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: document_parse_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_parse_artifacts (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    document_id uuid NOT NULL,
    artifact_type character varying(64) NOT NULL,
    storage_path character varying(1024) NOT NULL,
    mime_type character varying(255),
    size_bytes integer,
    checksum_sha256 character varying(128),
    artifact_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    file_type character varying(100) NOT NULL,
    status integer NOT NULL,
    upload_time timestamp with time zone NOT NULL,
    processing_task_id character varying(255),
    filename_key character varying(255) NOT NULL
);


--
-- Name: feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedbacks (
    id uuid NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT ck_feedbacks_rating_range CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: generation_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generation_commands (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    generation_id uuid NOT NULL,
    idempotency_key character varying(160) NOT NULL,
    action public.generation_command_action NOT NULL,
    fence integer NOT NULL,
    result jsonb
);


--
-- Name: generations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generations (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    terminal_at timestamp with time zone,
    logical_turn_id character varying(160) NOT NULL,
    checkpoint_thread_id character varying(320) NOT NULL,
    user_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    status public.generation_status NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    execution_epoch integer DEFAULT 0 NOT NULL,
    active_agent_id character varying(160),
    terminal_reason character varying(128),
    execution_budget jsonb,
    research_accounting jsonb,
    assistant_message_id uuid,
    continuation_id uuid,
    continuation_available boolean DEFAULT false NOT NULL,
    continuation_block_reason character varying(128),
    producer_token character varying(255)
);


--
-- Name: hitl_interrupts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hitl_interrupts (
    id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    thread_id character varying(255) NOT NULL,
    assistant_message_id uuid,
    status public.hitl_interrupt_status DEFAULT 'pending'::public.hitl_interrupt_status NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by_user_id uuid,
    resolution_source character varying(50),
    action_requests_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    device_id uuid,
    interrupt_metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    session_id character varying(255),
    catalog_version integer,
    tool_instance_id character varying(64)
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    conversation_id uuid NOT NULL,
    sender integer NOT NULL,
    content text NOT NULL,
    id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    message_metadata jsonb DEFAULT '{}'::jsonb,
    sequence bigint NOT NULL,
    CONSTRAINT ck_messages_sequence_positive CHECK ((sequence > 0))
);


--
-- Name: model_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_providers (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    user_id uuid NOT NULL,
    provider_type text NOT NULL,
    api_key_encrypted text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: model_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_usage_events (
    id uuid NOT NULL,
    event_key character varying(160) NOT NULL,
    operation_id uuid NOT NULL,
    attempt integer NOT NULL,
    user_id uuid,
    conversation_id uuid,
    request_message_id uuid,
    document_id uuid,
    correlation_id character varying(128),
    langsmith_run_id uuid,
    provider_request_id character varying(255),
    provider character varying(32) NOT NULL,
    model character varying(255) NOT NULL,
    operation character varying(64) NOT NULL,
    agent_id character varying(128),
    status character varying(16) NOT NULL,
    usage_source character varying(32) NOT NULL,
    input_tokens bigint,
    output_tokens bigint,
    total_tokens bigint,
    reasoning_tokens bigint,
    cached_input_tokens bigint,
    input_text_tokens bigint,
    input_image_tokens bigint,
    output_text_tokens bigint,
    output_image_tokens bigint,
    generated_images integer NOT NULL,
    latency_ms bigint NOT NULL,
    error_code character varying(128),
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_model_usage_events_attempt_positive CHECK ((attempt >= 1)),
    CONSTRAINT ck_model_usage_events_cached_input_tokens_nonnegative CHECK (((cached_input_tokens IS NULL) OR (cached_input_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_generated_images_nonnegative CHECK ((generated_images >= 0)),
    CONSTRAINT ck_model_usage_events_input_image_tokens_nonnegative CHECK (((input_image_tokens IS NULL) OR (input_image_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_input_text_tokens_nonnegative CHECK (((input_text_tokens IS NULL) OR (input_text_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_input_tokens_nonnegative CHECK (((input_tokens IS NULL) OR (input_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_latency_ms_nonnegative CHECK ((latency_ms >= 0)),
    CONSTRAINT ck_model_usage_events_output_image_tokens_nonnegative CHECK (((output_image_tokens IS NULL) OR (output_image_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_output_text_tokens_nonnegative CHECK (((output_text_tokens IS NULL) OR (output_text_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_output_tokens_nonnegative CHECK (((output_tokens IS NULL) OR (output_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_reasoning_tokens_nonnegative CHECK (((reasoning_tokens IS NULL) OR (reasoning_tokens >= 0))),
    CONSTRAINT ck_model_usage_events_total_tokens_nonnegative CHECK (((total_tokens IS NULL) OR (total_tokens >= 0)))
);


--
-- Name: model_usage_minute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_usage_minute (
    rollup_key character varying(64) NOT NULL,
    bucket_start_utc timestamp with time zone NOT NULL,
    user_id uuid,
    conversation_id uuid,
    provider character varying(32) NOT NULL,
    model character varying(255) NOT NULL,
    operation character varying(64) NOT NULL,
    agent_id character varying(128),
    status character varying(16) NOT NULL,
    usage_source character varying(32) NOT NULL,
    input_tokens_sum bigint DEFAULT 0 NOT NULL,
    input_tokens_known_count bigint DEFAULT 0 NOT NULL,
    output_tokens_sum bigint DEFAULT 0 NOT NULL,
    output_tokens_known_count bigint DEFAULT 0 NOT NULL,
    total_tokens_sum bigint DEFAULT 0 NOT NULL,
    total_tokens_known_count bigint DEFAULT 0 NOT NULL,
    reasoning_tokens_sum bigint DEFAULT 0 NOT NULL,
    reasoning_tokens_known_count bigint DEFAULT 0 NOT NULL,
    cached_input_tokens_sum bigint DEFAULT 0 NOT NULL,
    cached_input_tokens_known_count bigint DEFAULT 0 NOT NULL,
    input_text_tokens_sum bigint DEFAULT 0 NOT NULL,
    input_text_tokens_known_count bigint DEFAULT 0 NOT NULL,
    input_image_tokens_sum bigint DEFAULT 0 NOT NULL,
    input_image_tokens_known_count bigint DEFAULT 0 NOT NULL,
    output_text_tokens_sum bigint DEFAULT 0 NOT NULL,
    output_text_tokens_known_count bigint DEFAULT 0 NOT NULL,
    output_image_tokens_sum bigint DEFAULT 0 NOT NULL,
    output_image_tokens_known_count bigint DEFAULT 0 NOT NULL,
    generated_images_sum bigint DEFAULT 0 NOT NULL,
    request_count bigint DEFAULT 0 NOT NULL,
    latency_ms_sum bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_mu_minute_cached_input_tokens_known_count_nonneg CHECK ((cached_input_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_cached_input_tokens_sum_nonneg CHECK ((cached_input_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_generated_images_sum_nonneg CHECK ((generated_images_sum >= 0)),
    CONSTRAINT ck_mu_minute_input_image_tokens_known_count_nonneg CHECK ((input_image_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_input_image_tokens_sum_nonneg CHECK ((input_image_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_input_text_tokens_known_count_nonneg CHECK ((input_text_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_input_text_tokens_sum_nonneg CHECK ((input_text_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_input_tokens_known_count_nonneg CHECK ((input_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_input_tokens_sum_nonneg CHECK ((input_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_latency_ms_sum_nonneg CHECK ((latency_ms_sum >= 0)),
    CONSTRAINT ck_mu_minute_output_image_tokens_known_count_nonneg CHECK ((output_image_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_output_image_tokens_sum_nonneg CHECK ((output_image_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_output_text_tokens_known_count_nonneg CHECK ((output_text_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_output_text_tokens_sum_nonneg CHECK ((output_text_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_output_tokens_known_count_nonneg CHECK ((output_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_output_tokens_sum_nonneg CHECK ((output_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_reasoning_tokens_known_count_nonneg CHECK ((reasoning_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_reasoning_tokens_sum_nonneg CHECK ((reasoning_tokens_sum >= 0)),
    CONSTRAINT ck_mu_minute_request_count_nonneg CHECK ((request_count >= 0)),
    CONSTRAINT ck_mu_minute_total_tokens_known_count_nonneg CHECK ((total_tokens_known_count >= 0)),
    CONSTRAINT ck_mu_minute_total_tokens_sum_nonneg CHECK ((total_tokens_sum >= 0))
);


--
-- Name: project_custom_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_custom_agents (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid NOT NULL,
    project_id uuid NOT NULL,
    custom_agent_id uuid NOT NULL,
    agent_order integer DEFAULT 0 NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    owner_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    instructions text
);


--
-- Name: server_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_secrets (
    name character varying(64) NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skill_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_settings (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    skill_name character varying(255) NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: task_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_plans (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    task_order integer NOT NULL,
    description text NOT NULL,
    status public.task_status NOT NULL,
    task_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: tool_approval_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_approval_settings (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    scope_type character varying(16) NOT NULL,
    scope_value character varying(512) NOT NULL,
    require_approval boolean DEFAULT true NOT NULL,
    device_id uuid NOT NULL,
    tool_origin character varying(32) NOT NULL,
    CONSTRAINT ck_tool_approval_settings_scope_type CHECK (((scope_type)::text = ANY ((ARRAY['server'::character varying, 'tool'::character varying])::text[]))),
    CONSTRAINT ck_tool_approval_settings_tool_origin CHECK (((tool_origin)::text = ANY ((ARRAY['client_mcp'::character varying, 'client_skill'::character varying])::text[])))
);


--
-- Name: tool_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_approvals (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    interrupt_id character varying(255) NOT NULL,
    tool_name character varying(255) NOT NULL,
    tool_call_id character varying(255) NOT NULL,
    original_args jsonb NOT NULL,
    modified_args jsonb,
    decision public.decision_type NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id uuid,
    tool_origin character varying(32),
    server_name character varying(255),
    qualified_tool_id character varying(512),
    session_id character varying(255),
    catalog_version integer,
    tool_instance_id character varying(64)
);


--
-- Name: tool_execution_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_execution_receipts (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    execution_key character varying(64) NOT NULL,
    status public.tool_execution_receipt_status NOT NULL,
    user_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    turn_id character varying(160) NOT NULL,
    thread_id character varying(320) NOT NULL,
    dispatch_id character varying(64) NOT NULL,
    task_id character varying(160) NOT NULL,
    tool_call_id character varying(255) NOT NULL,
    qualified_tool_id character varying(512) NOT NULL,
    provider_idempotency boolean DEFAULT false NOT NULL,
    result_json jsonb,
    artifact_ref character varying(512),
    provider_receipt_id character varying(255),
    error_code character varying(128)
);


--
-- Name: tool_result_blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_result_blobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tool_call_id character varying(255),
    tool_name character varying(255) NOT NULL,
    storage_path character varying(1024),
    sha256 character varying(64) NOT NULL,
    size_bytes integer NOT NULL,
    content_type character varying(128) DEFAULT 'text/plain'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    content text
);


--
-- Name: user_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    source character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    project_id uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    username character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    avatar_url character varying(2048),
    id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    token_version integer DEFAULT 0 NOT NULL
);


--
-- Name: web_image_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_image_references (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    upstream_url character varying(4096) NOT NULL,
    expected_mime character varying(128),
    provider character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    content bytea,
    cached_width integer,
    cached_height integer,
    lifecycle_state character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT ck_web_image_references_lifecycle_state CHECK (((lifecycle_state)::text = ANY ((ARRAY['pending'::character varying, 'selected'::character varying, 'released'::character varying])::text[])))
);


--
-- Name: agent_model_configs agent_model_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_model_configs
    ADD CONSTRAINT agent_model_configs_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: chat_images chat_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_images
    ADD CONSTRAINT chat_images_pkey PRIMARY KEY (id);


--
-- Name: client_devices client_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_devices
    ADD CONSTRAINT client_devices_pkey PRIMARY KEY (id);


--
-- Name: conversation_custom_agents conversation_custom_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_custom_agents
    ADD CONSTRAINT conversation_custom_agents_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: custom_agents custom_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_agents
    ADD CONSTRAINT custom_agents_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_qdrant_point_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_qdrant_point_id_key UNIQUE (qdrant_point_id);


--
-- Name: document_images document_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_images
    ADD CONSTRAINT document_images_pkey PRIMARY KEY (id);


--
-- Name: document_index_generations document_index_generations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_index_generations
    ADD CONSTRAINT document_index_generations_pkey PRIMARY KEY (id);


--
-- Name: document_parse_artifacts document_parse_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parse_artifacts
    ADD CONSTRAINT document_parse_artifacts_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: feedbacks feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: generation_commands generation_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_commands
    ADD CONSTRAINT generation_commands_pkey PRIMARY KEY (id);


--
-- Name: generations generations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generations
    ADD CONSTRAINT generations_pkey PRIMARY KEY (id);


--
-- Name: hitl_interrupts hitl_interrupts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitl_interrupts
    ADD CONSTRAINT hitl_interrupts_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: model_providers model_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_providers
    ADD CONSTRAINT model_providers_pkey PRIMARY KEY (id);


--
-- Name: conversation_memory_summaries pk_conversation_memory_summaries; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory_summaries
    ADD CONSTRAINT pk_conversation_memory_summaries PRIMARY KEY (conversation_id);


--
-- Name: conversation_summary_jobs pk_conversation_summary_jobs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summary_jobs
    ADD CONSTRAINT pk_conversation_summary_jobs PRIMARY KEY (conversation_id);


--
-- Name: model_usage_events pk_model_usage_events; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT pk_model_usage_events PRIMARY KEY (id);


--
-- Name: model_usage_minute pk_model_usage_minute; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_minute
    ADD CONSTRAINT pk_model_usage_minute PRIMARY KEY (rollup_key);


--
-- Name: project_custom_agents project_custom_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_custom_agents
    ADD CONSTRAINT project_custom_agents_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: server_secrets server_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_secrets
    ADD CONSTRAINT server_secrets_pkey PRIMARY KEY (name);


--
-- Name: skill_settings skill_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_settings
    ADD CONSTRAINT skill_settings_pkey PRIMARY KEY (id);


--
-- Name: task_plans task_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_plans
    ADD CONSTRAINT task_plans_pkey PRIMARY KEY (id);


--
-- Name: tool_approval_settings tool_approval_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approval_settings
    ADD CONSTRAINT tool_approval_settings_pkey PRIMARY KEY (id);


--
-- Name: tool_approvals tool_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approvals
    ADD CONSTRAINT tool_approvals_pkey PRIMARY KEY (id);


--
-- Name: tool_execution_receipts tool_execution_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_receipts
    ADD CONSTRAINT tool_execution_receipts_pkey PRIMARY KEY (id);


--
-- Name: tool_result_blobs tool_result_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_result_blobs
    ADD CONSTRAINT tool_result_blobs_pkey PRIMARY KEY (id);


--
-- Name: client_devices uq_client_devices_user_device_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_devices
    ADD CONSTRAINT uq_client_devices_user_device_id UNIQUE (user_id, device_identifier);


--
-- Name: conversation_custom_agents uq_conversation_custom_agents_conv_agent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_custom_agents
    ADD CONSTRAINT uq_conversation_custom_agents_conv_agent UNIQUE (conversation_id, custom_agent_id);


--
-- Name: conversations uq_conversations_owner_fork_request; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT uq_conversations_owner_fork_request UNIQUE (owner_id, fork_request_id);


--
-- Name: document_chunks uq_document_chunk_generation_index; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT uq_document_chunk_generation_index UNIQUE (document_id, index_generation_id, chunk_index);


--
-- Name: document_parse_artifacts uq_document_parse_artifact_path; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parse_artifacts
    ADD CONSTRAINT uq_document_parse_artifact_path UNIQUE (document_id, artifact_type, storage_path);


--
-- Name: documents uq_documents_conversation_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT uq_documents_conversation_filename_key UNIQUE (conversation_id, filename_key);


--
-- Name: messages uq_messages_conversation_sequence; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT uq_messages_conversation_sequence UNIQUE (conversation_id, sequence);


--
-- Name: model_usage_events uq_model_usage_events_event_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT uq_model_usage_events_event_key UNIQUE (event_key);


--
-- Name: model_usage_events uq_model_usage_events_operation_attempt; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT uq_model_usage_events_operation_attempt UNIQUE (operation_id, attempt);


--
-- Name: project_custom_agents uq_project_custom_agents_project_agent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_custom_agents
    ADD CONSTRAINT uq_project_custom_agents_project_agent UNIQUE (project_id, custom_agent_id);


--
-- Name: skill_settings uq_skill_settings_user_skill; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_settings
    ADD CONSTRAINT uq_skill_settings_user_skill UNIQUE (user_id, skill_name);


--
-- Name: task_plans uq_task_plan_conversation_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_plans
    ADD CONSTRAINT uq_task_plan_conversation_order UNIQUE (conversation_id, task_order) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tool_approval_settings uq_tool_approval_settings_user_device_origin_scope; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approval_settings
    ADD CONSTRAINT uq_tool_approval_settings_user_device_origin_scope UNIQUE (user_id, device_id, tool_origin, scope_type, scope_value);


--
-- Name: user_memories user_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT user_memories_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: web_image_references web_image_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_image_references
    ADD CONSTRAINT web_image_references_pkey PRIMARY KEY (id);


--
-- Name: idx_agent_model_configs_user_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_model_configs_user_agent ON public.agent_model_configs USING btree (user_id, agent_key);


--
-- Name: idx_document_chunks_content_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_chunks_content_sha256 ON public.document_chunks USING btree (content_sha256);


--
-- Name: idx_document_chunks_content_simple_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_chunks_content_simple_fts ON public.document_chunks USING gin (to_tsvector('simple'::regconfig, content));


--
-- Name: idx_document_chunks_index_generation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_chunks_index_generation_id ON public.document_chunks USING btree (index_generation_id);


--
-- Name: idx_document_chunks_index_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_chunks_index_status ON public.document_chunks USING btree (index_status);


--
-- Name: idx_document_chunks_parse_artifact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_chunks_parse_artifact_id ON public.document_chunks USING btree (parse_artifact_id);


--
-- Name: idx_document_images_chunk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_images_chunk_id ON public.document_images USING btree (chunk_id);


--
-- Name: idx_document_images_content_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_images_content_sha256 ON public.document_images USING btree (content_sha256);


--
-- Name: idx_document_images_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_images_document_id ON public.document_images USING btree (document_id);


--
-- Name: idx_document_index_generations_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_index_generations_document ON public.document_index_generations USING btree (document_id);


--
-- Name: idx_document_index_generations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_index_generations_status ON public.document_index_generations USING btree (status);


--
-- Name: idx_document_processing_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_processing_task_id ON public.documents USING btree (processing_task_id);


--
-- Name: idx_message_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_conversation_created ON public.messages USING btree (conversation_id, created_at);


--
-- Name: idx_messages_content_simple_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_content_simple_fts ON public.messages USING gin (to_tsvector('simple'::regconfig, content));


--
-- Name: idx_model_providers_user_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_model_providers_user_default ON public.model_providers USING btree (user_id, is_default) WHERE (is_default = true);


--
-- Name: idx_model_providers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_model_providers_user_id ON public.model_providers USING btree (user_id);


--
-- Name: idx_model_providers_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_model_providers_user_type ON public.model_providers USING btree (user_id, provider_type) WHERE (deleted_at IS NULL);


--
-- Name: ix_chat_images_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_images_conversation_id ON public.chat_images USING btree (conversation_id);


--
-- Name: ix_chat_images_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_images_user_id ON public.chat_images USING btree (user_id);


--
-- Name: ix_client_devices_device_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_devices_device_identifier ON public.client_devices USING btree (device_identifier);


--
-- Name: ix_client_devices_last_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_devices_last_seen_at ON public.client_devices USING btree (last_seen_at);


--
-- Name: ix_client_devices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_devices_status ON public.client_devices USING btree (status);


--
-- Name: ix_conversation_custom_agents_custom_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversation_custom_agents_custom_agent_id ON public.conversation_custom_agents USING btree (custom_agent_id);


--
-- Name: ix_conversation_custom_agents_owner_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversation_custom_agents_owner_conv ON public.conversation_custom_agents USING btree (owner_id, conversation_id);


--
-- Name: ix_conversations_forked_from_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_forked_from_conversation_id ON public.conversations USING btree (forked_from_conversation_id);


--
-- Name: ix_conversations_forked_from_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_forked_from_message_id ON public.conversations USING btree (forked_from_message_id);


--
-- Name: ix_conversations_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_owner_id ON public.conversations USING btree (owner_id);


--
-- Name: ix_conversations_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_project_id ON public.conversations USING btree (project_id);


--
-- Name: ix_conversations_project_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_project_updated ON public.conversations USING btree (project_id, updated_at) WHERE (deleted_at IS NULL);


--
-- Name: ix_custom_agents_owner_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_custom_agents_owner_deleted ON public.custom_agents USING btree (owner_id, deleted_at);


--
-- Name: ix_document_parse_artifacts_artifact_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_document_parse_artifacts_artifact_type ON public.document_parse_artifacts USING btree (artifact_type);


--
-- Name: ix_feedbacks_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_feedbacks_message_id ON public.feedbacks USING btree (message_id);


--
-- Name: ix_feedbacks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feedbacks_user_id ON public.feedbacks USING btree (user_id);


--
-- Name: ix_generation_commands_generation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_generation_commands_generation_id ON public.generation_commands USING btree (generation_id);


--
-- Name: ix_generations_assistant_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_generations_assistant_message_id ON public.generations USING btree (assistant_message_id);


--
-- Name: ix_generations_checkpoint_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_generations_checkpoint_thread ON public.generations USING btree (checkpoint_thread_id);


--
-- Name: ix_generations_continuation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_generations_continuation_id ON public.generations USING btree (continuation_id);


--
-- Name: ix_generations_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_generations_conversation_id ON public.generations USING btree (conversation_id);


--
-- Name: ix_generations_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_generations_owner_status ON public.generations USING btree (user_id, status);


--
-- Name: ix_hitl_interrupts_assistant_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_assistant_message_id ON public.hitl_interrupts USING btree (assistant_message_id);


--
-- Name: ix_hitl_interrupts_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_conversation_id ON public.hitl_interrupts USING btree (conversation_id);


--
-- Name: ix_hitl_interrupts_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_device_id ON public.hitl_interrupts USING btree (device_id);


--
-- Name: ix_hitl_interrupts_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_expires_at ON public.hitl_interrupts USING btree (expires_at);


--
-- Name: ix_hitl_interrupts_resolved_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_resolved_by_user_id ON public.hitl_interrupts USING btree (resolved_by_user_id);


--
-- Name: ix_hitl_interrupts_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_session_id ON public.hitl_interrupts USING btree (session_id);


--
-- Name: ix_hitl_interrupts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_status ON public.hitl_interrupts USING btree (status);


--
-- Name: ix_hitl_interrupts_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_thread_id ON public.hitl_interrupts USING btree (thread_id);


--
-- Name: ix_hitl_interrupts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hitl_interrupts_user_id ON public.hitl_interrupts USING btree (user_id);


--
-- Name: ix_messages_prompt_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_messages_prompt_history ON public.messages USING btree (conversation_id, sequence) WHERE (deleted_at IS NULL);


--
-- Name: ix_model_usage_events_conversation_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_conversation_started ON public.model_usage_events USING btree (conversation_id, started_at);


--
-- Name: ix_model_usage_events_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_document_id ON public.model_usage_events USING btree (document_id);


--
-- Name: ix_model_usage_events_operation_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_operation_started ON public.model_usage_events USING btree (operation, started_at);


--
-- Name: ix_model_usage_events_provider_model_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_provider_model_started ON public.model_usage_events USING btree (provider, model, started_at);


--
-- Name: ix_model_usage_events_request_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_request_message_id ON public.model_usage_events USING btree (request_message_id);


--
-- Name: ix_model_usage_events_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_started_at ON public.model_usage_events USING btree (started_at);


--
-- Name: ix_model_usage_events_user_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_events_user_started ON public.model_usage_events USING btree (user_id, started_at);


--
-- Name: ix_model_usage_minute_bucket_start_utc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_minute_bucket_start_utc ON public.model_usage_minute USING btree (bucket_start_utc);


--
-- Name: ix_model_usage_minute_conversation_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_minute_conversation_bucket ON public.model_usage_minute USING btree (conversation_id, bucket_start_utc);


--
-- Name: ix_model_usage_minute_user_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_usage_minute_user_bucket ON public.model_usage_minute USING btree (user_id, bucket_start_utc);


--
-- Name: ix_project_custom_agents_custom_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_custom_agents_custom_agent_id ON public.project_custom_agents USING btree (custom_agent_id);


--
-- Name: ix_project_custom_agents_owner_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_custom_agents_owner_project ON public.project_custom_agents USING btree (owner_id, project_id);


--
-- Name: ix_projects_owner_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_projects_owner_deleted ON public.projects USING btree (owner_id, deleted_at);


--
-- Name: ix_skill_settings_skill_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_skill_settings_skill_name ON public.skill_settings USING btree (skill_name);


--
-- Name: ix_summary_jobs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_summary_jobs_due ON public.conversation_summary_jobs USING btree (status, available_at);


--
-- Name: ix_tool_approval_settings_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approval_settings_device_id ON public.tool_approval_settings USING btree (device_id);


--
-- Name: ix_tool_approval_settings_scope_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approval_settings_scope_value ON public.tool_approval_settings USING btree (scope_value);


--
-- Name: ix_tool_approval_settings_tool_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approval_settings_tool_origin ON public.tool_approval_settings USING btree (tool_origin);


--
-- Name: ix_tool_approvals_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_conversation_id ON public.tool_approvals USING btree (conversation_id);


--
-- Name: ix_tool_approvals_decided_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_decided_at ON public.tool_approvals USING btree (decided_at);


--
-- Name: ix_tool_approvals_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_device_id ON public.tool_approvals USING btree (device_id);


--
-- Name: ix_tool_approvals_interrupt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_interrupt_id ON public.tool_approvals USING btree (interrupt_id);


--
-- Name: ix_tool_approvals_qualified_tool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_qualified_tool_id ON public.tool_approvals USING btree (qualified_tool_id);


--
-- Name: ix_tool_approvals_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_session_id ON public.tool_approvals USING btree (session_id);


--
-- Name: ix_tool_approvals_tool_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_tool_instance_id ON public.tool_approvals USING btree (tool_instance_id);


--
-- Name: ix_tool_approvals_tool_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_tool_origin ON public.tool_approvals USING btree (tool_origin);


--
-- Name: ix_tool_approvals_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_approvals_user_id ON public.tool_approvals USING btree (user_id);


--
-- Name: ix_tool_execution_receipts_conversation_turn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_execution_receipts_conversation_turn ON public.tool_execution_receipts USING btree (conversation_id, turn_id);


--
-- Name: ix_tool_execution_receipts_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_execution_receipts_owner_status ON public.tool_execution_receipts USING btree (user_id, status);


--
-- Name: ix_tool_execution_receipts_qualified_tool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_execution_receipts_qualified_tool_id ON public.tool_execution_receipts USING btree (qualified_tool_id);


--
-- Name: ix_tool_execution_receipts_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_execution_receipts_thread_id ON public.tool_execution_receipts USING btree (thread_id);


--
-- Name: ix_tool_result_blobs_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_result_blobs_conversation_id ON public.tool_result_blobs USING btree (conversation_id);


--
-- Name: ix_tool_result_blobs_tool_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_result_blobs_tool_call_id ON public.tool_result_blobs USING btree (tool_call_id);


--
-- Name: ix_tool_result_blobs_tool_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_result_blobs_tool_name ON public.tool_result_blobs USING btree (tool_name);


--
-- Name: ix_tool_result_blobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tool_result_blobs_user_id ON public.tool_result_blobs USING btree (user_id);


--
-- Name: ix_user_memories_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_memories_project_id ON public.user_memories USING btree (project_id);


--
-- Name: ix_user_memories_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_memories_user_id ON public.user_memories USING btree (user_id);


--
-- Name: ix_user_memories_user_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_memories_user_project ON public.user_memories USING btree (user_id, project_id, deleted_at);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);


--
-- Name: ix_web_image_references_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_web_image_references_conversation_id ON public.web_image_references USING btree (conversation_id);


--
-- Name: ix_web_image_references_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_web_image_references_expires_at ON public.web_image_references USING btree (expires_at);


--
-- Name: ix_web_image_references_lifecycle_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_web_image_references_lifecycle_state ON public.web_image_references USING btree (lifecycle_state);


--
-- Name: ix_web_image_references_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_web_image_references_user_id ON public.web_image_references USING btree (user_id);


--
-- Name: uq_chat_images_user_sha256_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_chat_images_user_sha256_live ON public.chat_images USING btree (user_id, sha256) WHERE (deleted_at IS NULL);


--
-- Name: uq_custom_agents_owner_slug_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_custom_agents_owner_slug_active ON public.custom_agents USING btree (owner_id, slug) WHERE (deleted_at IS NULL);


--
-- Name: uq_document_index_generation_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_document_index_generation_active ON public.document_index_generations USING btree (document_id) WHERE ((status)::text = 'active'::text);


--
-- Name: uq_generation_commands_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_generation_commands_key ON public.generation_commands USING btree (generation_id, idempotency_key);


--
-- Name: uq_generations_active_per_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_generations_active_per_conversation ON public.generations USING btree (conversation_id) WHERE (status = ANY (ARRAY['continuing'::public.generation_status, 'finalizing_after_limit'::public.generation_status, 'running'::public.generation_status, 'starting'::public.generation_status, 'stop_requested'::public.generation_status]));


--
-- Name: uq_generations_logical_turn_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_generations_logical_turn_id ON public.generations USING btree (logical_turn_id);


--
-- Name: uq_tool_execution_receipts_execution_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tool_execution_receipts_execution_key ON public.tool_execution_receipts USING btree (execution_key);


--
-- Name: chat_images chat_images_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_images
    ADD CONSTRAINT chat_images_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: chat_images chat_images_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_images
    ADD CONSTRAINT chat_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: client_devices client_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_devices
    ADD CONSTRAINT client_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: conversation_custom_agents conversation_custom_agents_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_custom_agents
    ADD CONSTRAINT conversation_custom_agents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: conversation_custom_agents conversation_custom_agents_custom_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_custom_agents
    ADD CONSTRAINT conversation_custom_agents_custom_agent_id_fkey FOREIGN KEY (custom_agent_id) REFERENCES public.custom_agents(id);


--
-- Name: conversation_custom_agents conversation_custom_agents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_custom_agents
    ADD CONSTRAINT conversation_custom_agents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: conversations conversations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: custom_agents custom_agents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_agents
    ADD CONSTRAINT custom_agents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: document_chunks document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_chunks document_chunks_index_generation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_index_generation_id_fkey FOREIGN KEY (index_generation_id) REFERENCES public.document_index_generations(id) ON DELETE CASCADE;


--
-- Name: document_chunks document_chunks_parse_artifact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_parse_artifact_id_fkey FOREIGN KEY (parse_artifact_id) REFERENCES public.document_parse_artifacts(id) ON DELETE SET NULL;


--
-- Name: document_images document_images_chunk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_images
    ADD CONSTRAINT document_images_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.document_chunks(id) ON DELETE SET NULL;


--
-- Name: document_images document_images_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_images
    ADD CONSTRAINT document_images_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: document_index_generations document_index_generations_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_index_generations
    ADD CONSTRAINT document_index_generations_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_parse_artifacts document_parse_artifacts_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parse_artifacts
    ADD CONSTRAINT document_parse_artifacts_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: documents documents_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: feedbacks feedback_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedback_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: feedbacks feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: agent_model_configs fk_agent_model_configs_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_model_configs
    ADD CONSTRAINT fk_agent_model_configs_user_id FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: conversations fk_conversations_forked_from_conversation_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT fk_conversations_forked_from_conversation_id FOREIGN KEY (forked_from_conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: conversations fk_conversations_forked_from_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT fk_conversations_forked_from_message_id FOREIGN KEY (forked_from_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: conversations fk_conversations_project_id_projects; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT fk_conversations_project_id_projects FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: generations fk_generations_assistant_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generations
    ADD CONSTRAINT fk_generations_assistant_message FOREIGN KEY (assistant_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: hitl_interrupts fk_hitl_interrupts_device_id_client_devices; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitl_interrupts
    ADD CONSTRAINT fk_hitl_interrupts_device_id_client_devices FOREIGN KEY (device_id) REFERENCES public.client_devices(id);


--
-- Name: hitl_interrupts fk_hitl_interrupts_resolved_by_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitl_interrupts
    ADD CONSTRAINT fk_hitl_interrupts_resolved_by_user_id_users FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversation_memory_summaries fk_memory_summary_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory_summaries
    ADD CONSTRAINT fk_memory_summary_conversation FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_memory_summaries fk_memory_summary_conversation_sequence; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory_summaries
    ADD CONSTRAINT fk_memory_summary_conversation_sequence FOREIGN KEY (conversation_id, last_summarized_sequence) REFERENCES public.messages(conversation_id, sequence);


--
-- Name: model_providers fk_model_providers_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_providers
    ADD CONSTRAINT fk_model_providers_user_id FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: model_usage_events fk_model_usage_events_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT fk_model_usage_events_conversation FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: model_usage_events fk_model_usage_events_document; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT fk_model_usage_events_document FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: model_usage_events fk_model_usage_events_request_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT fk_model_usage_events_request_message FOREIGN KEY (request_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: model_usage_events fk_model_usage_events_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_events
    ADD CONSTRAINT fk_model_usage_events_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: model_usage_minute fk_model_usage_minute_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_minute
    ADD CONSTRAINT fk_model_usage_minute_conversation FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: model_usage_minute fk_model_usage_minute_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_usage_minute
    ADD CONSTRAINT fk_model_usage_minute_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: project_custom_agents fk_project_custom_agents_custom_agent_id_custom_agents; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_custom_agents
    ADD CONSTRAINT fk_project_custom_agents_custom_agent_id_custom_agents FOREIGN KEY (custom_agent_id) REFERENCES public.custom_agents(id);


--
-- Name: project_custom_agents fk_project_custom_agents_owner_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_custom_agents
    ADD CONSTRAINT fk_project_custom_agents_owner_id_users FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: project_custom_agents fk_project_custom_agents_project_id_projects; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_custom_agents
    ADD CONSTRAINT fk_project_custom_agents_project_id_projects FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: projects fk_projects_owner_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_projects_owner_id_users FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: conversation_summary_jobs fk_summary_job_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summary_jobs
    ADD CONSTRAINT fk_summary_job_conversation FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_summary_jobs fk_summary_job_conversation_sequence; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summary_jobs
    ADD CONSTRAINT fk_summary_job_conversation_sequence FOREIGN KEY (conversation_id, requested_through_sequence) REFERENCES public.messages(conversation_id, sequence);


--
-- Name: task_plans fk_task_plans_conversation_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_plans
    ADD CONSTRAINT fk_task_plans_conversation_id FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: tool_approval_settings fk_tool_approval_settings_device_id_client_devices; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approval_settings
    ADD CONSTRAINT fk_tool_approval_settings_device_id_client_devices FOREIGN KEY (device_id) REFERENCES public.client_devices(id) ON DELETE CASCADE;


--
-- Name: tool_approvals fk_tool_approvals_conversation_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approvals
    ADD CONSTRAINT fk_tool_approvals_conversation_id FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: tool_approvals fk_tool_approvals_device_id_client_devices; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approvals
    ADD CONSTRAINT fk_tool_approvals_device_id_client_devices FOREIGN KEY (device_id) REFERENCES public.client_devices(id);


--
-- Name: tool_approvals fk_tool_approvals_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approvals
    ADD CONSTRAINT fk_tool_approvals_user_id FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_memories fk_user_memories_project_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT fk_user_memories_project_id FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: generation_commands generation_commands_generation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_commands
    ADD CONSTRAINT generation_commands_generation_id_fkey FOREIGN KEY (generation_id) REFERENCES public.generations(id) ON DELETE CASCADE;


--
-- Name: generations generations_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generations
    ADD CONSTRAINT generations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: generations generations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generations
    ADD CONSTRAINT generations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: hitl_interrupts hitl_interrupts_assistant_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitl_interrupts
    ADD CONSTRAINT hitl_interrupts_assistant_message_id_fkey FOREIGN KEY (assistant_message_id) REFERENCES public.messages(id);


--
-- Name: hitl_interrupts hitl_interrupts_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitl_interrupts
    ADD CONSTRAINT hitl_interrupts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: hitl_interrupts hitl_interrupts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitl_interrupts
    ADD CONSTRAINT hitl_interrupts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: skill_settings skill_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_settings
    ADD CONSTRAINT skill_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: tool_approval_settings tool_approval_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_approval_settings
    ADD CONSTRAINT tool_approval_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: tool_execution_receipts tool_execution_receipts_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_receipts
    ADD CONSTRAINT tool_execution_receipts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: tool_execution_receipts tool_execution_receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_receipts
    ADD CONSTRAINT tool_execution_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: tool_result_blobs tool_result_blobs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_result_blobs
    ADD CONSTRAINT tool_result_blobs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: tool_result_blobs tool_result_blobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_result_blobs
    ADD CONSTRAINT tool_result_blobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_memories user_memories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_memories
    ADD CONSTRAINT user_memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: web_image_references web_image_references_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_image_references
    ADD CONSTRAINT web_image_references_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: web_image_references web_image_references_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_image_references
    ADD CONSTRAINT web_image_references_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict aFDVEnUghI0gcbn7m4tmc9KB2dcR50hCfoUnie3ckL2uLUSRSeGm4D3wLNAV8Og

