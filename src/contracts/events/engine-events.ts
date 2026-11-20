/**
 * Events the ENGINE publishes on `bus:engine:events`; the backend consumes them
 * (consumer group `backend`, inbox de-duplication) to update data it owns.
 *
 * ⚠️ DRAFT until the Engine side implements it (task ENG-04).
 */

/**
 * Parse/index progress of one upload attempt — replaces callback B1 and the
 * Python workers writing `documents.status` directly. The backend ignores events
 * whose `attemptId` is not the document's current attempt, and never moves a
 * status backwards (processing < ready | failed), so redelivery and reordering
 * are harmless.
 */
export interface DocumentProcessingStatusChangedV1 {
  readonly documentId: string;
  readonly attemptId: string;
  readonly status: 'processing' | 'ready' | 'failed';
  readonly indexGenerationId: string | null;
  readonly failureCode: string | null;
}

export interface EngineEventPayloads {
  'document.processing_status_changed': DocumentProcessingStatusChangedV1;
}

export type EngineEventType = keyof EngineEventPayloads;

export const ENGINE_EVENT_VERSIONS: {
  readonly [K in EngineEventType]: number;
} = {
  'document.processing_status_changed': 1,
};
