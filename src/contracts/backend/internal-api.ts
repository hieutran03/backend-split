/**
 * The BACKEND's internal API, called BY the Engine (docs/integration.md §4) — the
 * only way the Engine reads backend-owned data now that the databases are separate.
 *
 * - Internal network only; never routed by the public gateway.
 * - `Authorization: Bearer <engine→backend service token>` (a different token from
 *   the one the backend uses towards the Engine) + `X-Request-Id`.
 * - Every call names the user (`ownerId`/`userId`) the Engine acts for; a row that
 *   does not belong to that user is 404, like the public API (D15).
 * - Read-only. The Engine changes backend data only through its events
 *   (src/contracts/events/engine-events.ts).
 *
 * B1 (document status callback) is retired: it is the event
 * document.processing_status_changed.
 *
 * ⚠️ DRAFT until task INT-01 implements it and the Engine adopts it (ENG-04).
 */
import type { ModelRuntimeV1 } from '@contracts/engine/internal-api';

/**
 * B2 GET /internal/v1/conversations/{conversationId}/messages
 *     ?ownerId=&afterSequence=&throughSequence=&limit=
 *
 * Prompt history (C1), summary jobs and fork memory (C6, C18), request compaction,
 * latest assistant metadata for routing, canvas artifacts. Ordered by `sequence`
 * ascending; soft-deleted messages are left out. Deleted conversation ⇒ 404.
 */
export interface ListConversationMessagesQueryV1 {
  readonly ownerId: string;
  /** Exclusive lower bound (the Engine's memory cursor). Default 0. */
  readonly afterSequence?: number;
  /** Inclusive upper bound (E1 `history.throughSequence`). Default: latest. */
  readonly throughSequence?: number;
  /** 1..500, default 200. */
  readonly limit?: number;
}

export interface InternalMessageV1 {
  readonly id: string;
  readonly sequence: number;
  readonly sender: 'user' | 'assistant';
  readonly content: string;
  /** Stored metadata as is (NOT the sanitized public MessageView) — the Engine needs image refs etc. */
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListConversationMessagesResponseV1 {
  readonly conversationId: string;
  readonly items: readonly InternalMessageV1[];
  /** Pass as `afterSequence` for the next page; null ⇒ no more rows up to the bound. */
  readonly nextAfterSequence: number | null;
  /** Highest sequence of the conversation right now. */
  readonly lastSequence: number;
}

/**
 * B3 GET /internal/v1/users/{userId}/message-search?q=&projectId=&conversationId=&limit=
 *
 * Conversation-search tools (they full-text searched messages across all of the
 * user's conversations). Backed by the backend's FTS index on messages.content.
 */
export interface SearchUserMessagesQueryV1 {
  readonly q: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  /** 1..50, default 20. */
  readonly limit?: number;
}

export interface MessageSearchHitV1 {
  readonly conversationId: string;
  readonly conversationTitle: string | null;
  readonly conversationCreatedAt: string;
  readonly projectId: string | null;
  readonly messageId: string;
  readonly sequence: number;
  readonly sender: 'user' | 'assistant';
  readonly content: string;
  readonly createdAt: string;
}

export interface SearchUserMessagesResponseV1 {
  readonly items: readonly MessageSearchHitV1[];
}

/**
 * B4 POST /internal/v1/model-runtime/resolve
 *
 * Models + decrypted credentials for work OUTSIDE a turn (summary worker, C2); a
 * turn gets the same data in E1 `modelRuntime`. Response `Cache-Control: no-store`;
 * never logged on either side; the Engine may keep it in memory only, ≤ 5 minutes.
 */
export interface ResolveModelRuntimeRequestV1 {
  readonly userId: string;
  /** Limit to these agent keys; omitted ⇒ all. */
  readonly agentKeys?: readonly string[];
}

export type ResolveModelRuntimeResponseV1 = ModelRuntimeV1;
