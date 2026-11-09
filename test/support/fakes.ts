import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import type { Outbox, OutboxEvent } from '@platform/ports/outbox.port';
import type { TransactionManager } from '@platform/ports/transaction-manager.port';

/** Fake dùng chung cho unit test của mọi module. */
export class FixedClock implements Clock {
  public constructor(private current = new Date('2026-11-09T00:00:00.000Z')) {}
  public now(): Date {
    return new Date(this.current);
  }
  public advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  public uuid(): string {
    this.n += 1;
    return `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`;
  }
}

/** Chạy work ngay, ghi lại số lần gọi — đủ cho unit test use case. */
export class ImmediateTransactions implements TransactionManager {
  public runs = 0;
  public run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return work();
  }
}

export class RecordingOutbox implements Outbox {
  public readonly events: OutboxEvent[] = [];
  public enqueue(event: OutboxEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}
