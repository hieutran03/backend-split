import { randomUUID } from 'node:crypto';

import type { Outbox, OutboxEvent } from '@platform/ports/outbox.port';
import { type DbContext } from '../db-context';
import { OutboxEventRecord } from './outbox-event.record';

/**
 * Ghi outbox trong transaction hiện hành. Gọi ngoài transaction là lỗi lập trình:
 * side effect chéo miền phải commit cùng thay đổi nghiệp vụ (D9, D6).
 *
 * Publisher (đọc + gọi Engine + retry backoff 5 s × 2ⁿ) là task OBX-02.
 */
export class TypeOrmOutbox implements Outbox {
  public constructor(private readonly db: DbContext) {}

  public async enqueue(event: OutboxEvent): Promise<void> {
    if (!this.db.inTransaction) {
      throw new Error(
        'Outbox.enqueue() phải được gọi bên trong TransactionManager.run()',
      );
    }
    const now = new Date();
    await this.db.manager.insert(OutboxEventRecord, {
      id: randomUUID(),
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      // jsonb: kiểu QueryDeepPartialEntity của TypeORM không hiểu Record<string, unknown>.
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
