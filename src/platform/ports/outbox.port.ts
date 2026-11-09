/**
 * Transactional outbox (D9). Use cases call `enqueue` INSIDE the transaction; a
 * periodic publisher (task OBX-02) reads the outbox_events table and calls the Engine (E2/E5/E8/E9).
 * Never call the Engine directly for cross-domain side effects before commit.
 */
export type OutboxEventType =
  | 'conversation.deleted'
  | 'conversation.forked'
  | 'project.deleted'
  | 'message.mutated'
  | 'document.uploaded'
  | 'document.deleted'
  | 'interrupt.expired'
  | 'generation.lease_expired';

export interface OutboxEvent {
  readonly eventType: OutboxEventType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}

export interface Outbox {
  enqueue(event: OutboxEvent): Promise<void>;
}
export const OUTBOX = Symbol('OUTBOX');
