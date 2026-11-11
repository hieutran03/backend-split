import { createHash } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { ConflictError } from '@shared/errors/app-error';
import type { ConversationTurnLock } from '@platform/ports/turn-lock.port';

/**
 * §11: key = first 8 bytes of sha256(str(conversation_id)), big-endian, as a
 * signed int64. Python's str(UUID) is lowercase with hyphens. Returned as a
 * decimal string so it survives the trip to Postgres as `$1::bigint`.
 */
export function turnLockKey(conversationId: string): string {
  const digest = createHash('sha256')
    .update(conversationId.toLowerCase())
    .digest();
  return digest.readBigInt64BE(0).toString();
}

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_MS = 50;

/**
 * `pg_try_advisory_xact_lock` polled every 50 ms up to 30 s, on a dedicated
 * connection whose transaction lives for the whole `work` (§11: SET LOCAL
 * idle_in_transaction_session_timeout = 0 first). Ending that transaction — commit,
 * rollback or a dropped connection — releases the lock.
 */
export class PgConversationTurnLock implements ConversationTurnLock {
  public constructor(private readonly dataSource: DataSource) {}

  public async withLock<T>(
    conversationId: string,
    work: () => Promise<T>,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query('SET LOCAL idle_in_transaction_session_timeout = 0');
      const key = turnLockKey(conversationId);
      const deadline = Date.now() + (options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      for (;;) {
        const rows = (await runner.query(
          'SELECT pg_try_advisory_xact_lock($1::bigint) AS locked',
          [key],
        )) as Array<{ locked: boolean }>;
        if (rows[0]?.locked) break;
        if (Date.now() >= deadline) {
          throw new ConflictError(
            'Conversation is busy, try again later',
            'conversation_busy',
          );
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      const result = await work();
      await runner.commitTransaction();
      return result;
    } catch (error) {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction().catch(() => undefined);
      }
      throw error;
    } finally {
      await runner.release();
    }
  }
}
