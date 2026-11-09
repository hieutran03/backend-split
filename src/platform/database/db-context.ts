import { AsyncLocalStorage } from 'node:async_hooks';
import { type DataSource, type EntityManager } from 'typeorm';

import type {
  IsolationLevel,
  TransactionManager,
} from '@platform/ports/transaction-manager.port';

/**
 * Giữ EntityManager của transaction hiện hành trong AsyncLocalStorage.
 *
 * Repository LUÔN lấy manager qua `db.manager` — trong transaction thì nhận
 * manager của transaction, ngoài transaction thì nhận manager mặc định.
 * Nhờ vậy use case chỉ cần `transactions.run(async () => {...})`.
 */
export class DbContext {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  public constructor(public readonly dataSource: DataSource) {}

  public get manager(): EntityManager {
    return this.storage.getStore() ?? this.dataSource.manager;
  }

  public get inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  public async transaction<T>(
    work: () => Promise<T>,
    isolation: IsolationLevel = 'READ COMMITTED',
  ): Promise<T> {
    // Transaction lồng nhau => dùng lại transaction ngoài.
    if (this.inTransaction) return work();
    return this.dataSource.transaction(isolation, (manager) =>
      this.storage.run(manager, work),
    );
  }
}

export class TypeOrmTransactionManager implements TransactionManager {
  public constructor(private readonly db: DbContext) {}

  public run<T>(
    work: () => Promise<T>,
    options?: { isolation?: IsolationLevel },
  ): Promise<T> {
    return this.db.transaction(work, options?.isolation);
  }
}
