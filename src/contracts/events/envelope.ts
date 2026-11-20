/**
 * Integration events between the backend and the AI Engine (docs/integration.md).
 *
 * The two services own SEPARATE databases. A state change one side must learn
 * about travels as an event: written to the producer's outbox inside the business
 * transaction, relayed to a Redis Stream, consumed by the other side's consumer
 * group and de-duplicated there by `id` (inbox). Delivery is at-least-once and
 * per-aggregate order is NOT guaranteed — handlers must be idempotent and
 * order-tolerant.
 *
 * ⚠️ DRAFT until the Engine side implements it (task ENG-04).
 */

export type EventProducer = 'backend' | 'engine';

/** One stream per producer; each consuming service reads it with its own consumer group. */
export const EVENT_STREAMS = {
  backend: 'bus:backend:events',
  engine: 'bus:engine:events',
} as const satisfies Record<EventProducer, string>;

/** Entries that failed too many times are moved to `<stream>:dlq`. */
export const DEAD_LETTER_SUFFIX = ':dlq';

/** Consumer group name = the consuming service. */
export const CONSUMER_GROUPS = {
  backend: 'backend',
  engine: 'engine',
} as const satisfies Record<EventProducer, string>;

/**
 * Stream entry layout: field `type` (for filtering/metrics) and field `event`
 * (this envelope as JSON).
 */
export interface IntegrationEventEnvelope<
  TType extends string = string,
  TPayload = unknown,
> {
  /** UUID. The producer's outbox row id; the consumer's idempotency key. */
  readonly id: string;
  readonly type: TType;
  /** Payload schema version of `type`. Additive changes keep it; breaking ones bump it. */
  readonly version: number;
  readonly producer: EventProducer;
  /** ISO-8601 instant the producing transaction wrote the outbox row. */
  readonly occurredAt: string;
  readonly aggregate: { readonly type: string; readonly id: string };
  readonly payload: TPayload;
  /** X-Request-Id of the request that caused the event, for tracing. */
  readonly requestId?: string;
}
