import { AsyncLocalStorage } from 'node:async_hooks';
import { type DataSource, type EntityManager } from 'typeorm';

import type {
  IsolationLevel,
  TransactionManager,
} from '@platform/ports/transaction-manager.port';

/**
 * Holds the current transaction's EntityManager in AsyncLocalStorage.
 *
 * Repositories ALWAYS get the manager via `db.manager` — inside a transaction they get
 * the transaction's manager, outside one they get the default manager.
 * That way use cases only need `transactions.run(async () => {...})`.
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
    // Nested transaction => reuse the outer transaction.
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
