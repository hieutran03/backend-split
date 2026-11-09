/**
 * Chạy `work` trong một transaction. Repository bên trong tự lấy EntityManager
 * của transaction hiện hành (AsyncLocalStorage), nên use case không cần truyền
 * manager đi khắp nơi.
 *
 * Quy tắc: outbox (D9) phải được ghi TRONG cùng transaction với thay đổi nghiệp vụ.
 */
export type IsolationLevel =
  'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionManager {
  run<T>(
    work: () => Promise<T>,
    options?: { isolation?: IsolationLevel },
  ): Promise<T>;
}
export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');
