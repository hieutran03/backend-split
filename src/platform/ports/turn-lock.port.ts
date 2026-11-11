/**
 * Per-conversation turn lock (D3, §11 "Khoá lượt"). Shared with the Python service
 * while both run: same Postgres advisory-lock key, so a fork here and a turn there
 * exclude each other.
 *
 * `withLock` holds the lock on its OWN connection for the whole `work` (Python keeps
 * it on a dedicated session too); `work` opens its own transactions as usual.
 * Not acquired within `timeoutMs` ⇒ ConflictError(conversation_busy).
 */
export interface ConversationTurnLock {
  withLock<T>(
    conversationId: string,
    work: () => Promise<T>,
    options?: { timeoutMs?: number },
  ): Promise<T>;
}
export const CONVERSATION_TURN_LOCK = Symbol('CONVERSATION_TURN_LOCK');
