import { randomUUID } from 'node:crypto';

import type { Outbox, OutboxEvent } from '@platform/ports/outbox.port';
import { type DbContext } from '../db-context';
import { OutboxEventRecord } from './outbox-event.record';

/**
 * Writes the outbox within the current transaction. Calling it outside a transaction is a
 * programming error: cross-domain side effects must commit with the business change (D9, D6).
 *
 * The publisher (read + call Engine + retry backoff 5 s × 2ⁿ) is task OBX-02.
 */
export class TypeOrmOutbox implements Outbox {
  public constructor(private readonly db: DbContext) {}

  public async enqueue(event: OutboxEvent): Promise<void> {
    if (!this.db.inTransaction) {
      throw new Error(
        'Outbox.enqueue() must be called inside TransactionManager.run()',
      );
    }
    const now = new Date();
    await this.db.manager.insert(OutboxEventRecord, {
      id: randomUUID(),
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      // jsonb: TypeORM's QueryDeepPartialEntity type doesn't understand Record<string, unknown>.
      payload: event.payload as never,
      status: 'pending',
      attemptCount: 0,
      availableAt: now,
      lastError: null,
      publishedAt: null,
      createdAt: now,
    });
  }
}
