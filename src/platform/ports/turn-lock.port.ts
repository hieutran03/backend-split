/**
 * Per-conversation turn lock (D3, §11 "Khoá lượt"). Only the backend locks: forks and
 * turns (W4) of one conversation exclude each other. The lock lives in the backend's
 * own database; the Engine never takes it and no longer shares a database with us
 * (docs/integration.md).
 *
 * `withLock` holds the lock on its OWN connection for the whole `work` (Python keeps
 * it on a dedicated session too); `work` opens its own transactions as usual.
 * Not acquired within `timeoutMs` ⇒ ConflictError(conversation_turn_conflict) — Python's code.
 */
export interface ConversationTurnLock {
  withLock<T>(
    conversationId: string,
    work: () => Promise<T>,
    options?: { timeoutMs?: number },
  ): Promise<T>;
}
export const CONVERSATION_TURN_LOCK = Symbol('CONVERSATION_TURN_LOCK');
