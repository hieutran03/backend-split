/**
 * Transactional outbox (D9). Use case gọi `enqueue` TRONG transaction; một
 * publisher định kỳ (task OBX-02) đọc bảng outbox_events và gọi Engine (E2/E5/E8/E9).
 * Không bao giờ gọi Engine trực tiếp cho side effect chéo miền trước khi commit.
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
