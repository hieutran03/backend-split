import type {
  BackendEventPayloads,
  BackendEventType,
} from '@contracts/events/backend-events';

/**
 * Transactional outbox (D9). Use cases call `enqueue` INSIDE the transaction, so the
 * event commits or rolls back with the business change. A relay (task BUS-01) reads
 * outbox_events and publishes each row as an integration event on the Redis Stream
 * `bus:backend:events` (envelope id = row id); the Engine consumes it. The backend never
 * calls the Engine — nor touches its database — for a cross-domain side effect.
 *
 * Event types and payloads are the contract in src/contracts/events/backend-events.ts.
 */
export type OutboxEventType = BackendEventType;

export interface OutboxEvent<T extends BackendEventType = BackendEventType> {
  readonly eventType: T;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: BackendEventPayloads[T];
}

export interface Outbox {
  enqueue<T extends BackendEventType>(event: OutboxEvent<T>): Promise<void>;
}
export const OUTBOX = Symbol('OUTBOX');
