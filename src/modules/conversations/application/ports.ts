import type { Page, PageRequest } from '@shared/pagination/page';
import type { Conversation } from '../domain/conversation';

export interface ConversationListFilter {
  readonly projectId?: string | undefined;
  /**
   * Case-insensitive substring match on the title OR on the content of a
   * non-deleted message (Python: "conversation title or message search").
   */
  readonly search?: string | undefined;
}

/** Every query is scoped to owner + not deleted: not owned = does not exist (D15). */
export interface ConversationRepository {
  findOwned(id: string, ownerId: string): Promise<Conversation | null>;
  /**
   * Same as findOwned but takes a row lock (SELECT … FOR UPDATE) until the
   * transaction ends. Must be called inside TransactionManager.run().
   */
  findOwnedForUpdate(id: string, ownerId: string): Promise<Conversation | null>;
  listOwned(
    ownerId: string,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<Page<Conversation>>;
  insert(conversation: Conversation): Promise<void>;
  /** Persists the mutable CRUD fields only (title, persona, planning flag, timestamps). */
  save(conversation: Conversation): Promise<void>;
  /**
   * A12a idempotency: the child created for (owner, requestId), deleted ones
   * included (the unique index has no deleted_at condition).
   */
  findForkRequest(
    ownerId: string,
    requestId: string,
  ): Promise<{ child: Conversation; fingerprint: string } | null>;
  /**
   * Inserts a fork child with its request id + fingerprint. A concurrent fork with
   * the same (owner, requestId) ⇒ throws ForkRequestTakenError.
   */
  insertFork(
    child: Conversation,
    request: { requestId: string; fingerprint: string },
  ): Promise<void>;
}

/** Thrown by insertFork when uq_conversations_owner_fork_request is hit. */
export class ForkRequestTakenError extends Error {
  public constructor() {
    super('fork request already used');
    this.name = 'ForkRequestTakenError';
  }
}
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/**
 * What this context needs from the projects context, in its own words.
 * Wired to the projects public API by an adapter (integration through a port).
 */
export interface ProjectAccess {
  /**
   * true when the project exists, is not deleted and belongs to `ownerId`; also
   * share-locks it until the transaction ends so it cannot be deleted meanwhile
   * (PJ-05). Inside TransactionManager.run() only.
   */
  lockOwnedActiveProject(ownerId: string, projectId: string): Promise<boolean>;
}
export const PROJECT_ACCESS = Symbol('PROJECT_ACCESS');

/**
 * Engine checkpoint threads that belong to a conversation, i.e.
 * generations.checkpoint_thread_id ∪ hitl_interrupts.thread_id (engine-contract,
 * outbox `conversation.deleted`). Read inside the delete transaction so the outbox
 * payload is self-contained.
 */
export interface ConversationThreadSource {
  threadIdsOf(conversationId: string): Promise<string[]>;
}
export const CONVERSATION_THREAD_SOURCE = Symbol('CONVERSATION_THREAD_SOURCE');

/** A message as shown inside the conversation list (same fields as A10 items). */
export interface ConversationMessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly sender: 'user' | 'assistant';
  readonly content: string;
  readonly messageMetadata: Record<string, unknown> | null;
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/**
 * What the conversation list needs from the messages context. Called only with
 * ids of conversations the caller owns.
 */
export interface ConversationMessages {
  countByConversation(conversationIds: string[]): Promise<Map<string, number>>;
  /** Newest first (-sequence). */
  latestByConversation(
    conversationIds: string[],
    perConversation: number,
  ): Promise<Map<string, ConversationMessageView[]>>;
}
export const CONVERSATION_MESSAGES = Symbol('CONVERSATION_MESSAGES');

/** What the fork needs from the messages context (adapter ⇒ FORK_MESSAGE_SOURCE). */
export interface ForkMessages {
  findMessage(
    conversationId: string,
    messageId: string,
  ): Promise<{ sequence: number; sender: 'user' | 'assistant' } | null>;
  prefixSize(
    conversationId: string,
    throughSequence: number,
  ): Promise<{ count: number; bytes: number }>;
  copyPrefix(
    sourceId: string,
    childId: string,
    throughSequence: number,
  ): Promise<number>;
}
export const FORK_MESSAGES = Symbol('FORK_MESSAGES');

/** sha256 hex of the fork request (TC-53); infrastructure owns the hashing. */
export interface ForkFingerprint {
  of(input: {
    sourceConversationId: string;
    messageId: string;
    title: string | null;
  }): string;
}
export const FORK_FINGERPRINT = Symbol('FORK_FINGERPRINT');
