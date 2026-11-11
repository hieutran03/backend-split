/**
 * Runs `work` in a transaction. Repositories inside pick up the EntityManager
 * of the current transaction themselves (AsyncLocalStorage), so use cases don't
 * need to pass the manager around.
 *
 * Rule: the outbox (D9) must be written INSIDE the same transaction as the business change.
 */
export type IsolationLevel =
  'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionOptions {
  readonly isolation?: IsolationLevel;
  /**
   * REPEATABLE READ / SERIALIZABLE only: rerun the WHOLE `work` in a new
   * transaction when Postgres aborts it with a serialization failure (40001),
   * at most this many extra times. `work` must therefore be safe to rerun.
   */
  readonly retriesOnSerializationFailure?: number;
}

export interface TransactionManager {
  run<T>(work: () => Promise<T>, options?: TransactionOptions): Promise<T>;
}
export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');
