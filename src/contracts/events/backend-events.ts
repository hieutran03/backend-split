/**
 * Events the BACKEND publishes on `bus:backend:events`; the Engine consumes them
 * to keep its own data (checkpoints, memory summaries, chunks, user memories,
 * caches) consistent with backend-owned data it can no longer read or cascade
 * from (docs/integration.md §5). They replace E5/E8/E9 and the cross-domain
 * writes Python made inside one transaction (C6, C17, C19).
 *
 * ⚠️ DRAFT until the Engine side implements it (task ENG-04).
 */

/** A12/A25 — conversation soft-deleted (CONV-02). */
export interface ConversationDeletedV1 {
  readonly conversationId: string;
  readonly ownerId: string;
  /** Checkpoint threads to delete: generations.checkpoint_thread_id ∪ hitl_interrupts.thread_id at delete time. */
  readonly threadIds: readonly string[];
}

/** A12a — fork created (CONV-03). The Engine prepares the child's memory (C17, C18). */
export interface ConversationForkedV1 {
  readonly childConversationId: string;
  readonly sourceConversationId: string;
  readonly ownerId: string;
  readonly forkedFromMessageId: string;
  /** The child holds copies of source messages 1..forkedThroughSequence (same sequences). */
  readonly forkedThroughSequence: number;
}

/**
 * A turn's messages are committed (GEN-04): replaces Python's "insert message ⇒
 * upsert conversation_summary_jobs" in the same transaction (C6).
 */
export interface ConversationTurnPersistedV1 {
  readonly conversationId: string;
  readonly ownerId: string;
  readonly generationId: string;
  readonly userMessageId: string;
  /** null when the turn ended without an assistant message. */
  readonly assistantMessageId: string | null;
  /** Highest message sequence of the conversation after this commit. */
  readonly throughSequence: number;
  readonly generationStatus: string;
}

/** A message was edited or deleted: summaries from `sequence` on are stale (C19). */
export interface MessageMutatedV1 {
  readonly conversationId: string;
  readonly ownerId: string;
  readonly messageId: string;
  readonly sequence: number;
  readonly mutation: 'edited' | 'deleted';
}

/** PJ5 — project soft-deleted; the Engine soft-deletes the project's user_memories (C19). */
export interface ProjectDeletedV1 {
  readonly projectId: string;
  readonly ownerId: string;
  /** How many conversations were detached (project_id set to NULL) in the same transaction. */
  readonly detachedConversations: number;
}

/** D1/D2 — file stored in object storage; the Engine parses + indexes it (replaces E8). */
export interface DocumentUploadedV1 {
  readonly documentId: string;
  /** Fences status events: only the latest attempt may change the document. */
  readonly attemptId: string;
  readonly ownerId: string;
  readonly conversationId: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** D5 — document deleted; the Engine drops chunks, images, parse artifacts, vectors (replaces E9). */
export interface DocumentDeletedV1 {
  readonly documentId: string;
  readonly ownerId: string;
  readonly conversationId: string;
}

/** HITL interrupt expired (SCH-01); the Engine deletes its checkpoint thread (replaces E5). */
export interface InterruptExpiredV1 {
  readonly interruptId: string;
  readonly conversationId: string;
  readonly ownerId: string;
  readonly threadId: string;
}

/** Lease reaper (SCH-01): the Engine stops the run if it is still going (same effect as E2). */
export interface GenerationLeaseExpiredV1 {
  readonly generationId: string;
  readonly conversationId: string;
  readonly generationVersion: number;
}

export interface BackendEventPayloads {
  'conversation.deleted': ConversationDeletedV1;
  'conversation.forked': ConversationForkedV1;
  'conversation.turn_persisted': ConversationTurnPersistedV1;
  'message.mutated': MessageMutatedV1;
  'project.deleted': ProjectDeletedV1;
  'document.uploaded': DocumentUploadedV1;
  'document.deleted': DocumentDeletedV1;
  'interrupt.expired': InterruptExpiredV1;
  'generation.lease_expired': GenerationLeaseExpiredV1;
}

export type BackendEventType = keyof BackendEventPayloads;

/** Current payload version of each event type (envelope `version`). */
export const BACKEND_EVENT_VERSIONS: {
  readonly [K in BackendEventType]: number;
} = {
  'conversation.deleted': 1,
  'conversation.forked': 1,
  'conversation.turn_persisted': 1,
  'message.mutated': 1,
  'project.deleted': 1,
  'document.uploaded': 1,
  'document.deleted': 1,
  'interrupt.expired': 1,
  'generation.lease_expired': 1,
};
