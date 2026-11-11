import type { ConversationThreadSource } from '../application/ports';

/**
 * Placeholder until the `generations` (GEN-02) and `hitl_interrupts` (W4) tables
 * exist: no turn can have run yet, so a conversation owns no checkpoint thread.
 * Replace with a query on generations.checkpoint_thread_id ∪ hitl_interrupts.thread_id
 * when those tables land.
 */
export class NoThreadSourceYet implements ConversationThreadSource {
  public threadIdsOf(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
