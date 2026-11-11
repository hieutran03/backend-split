/**
 * Project membership of conversations = the `conversations.project_id` column.
 * The projects context owns this column (PJ6, PJ7, PJ5 detach — as in Python
 * `app/api/projects.py`); the conversations context only sets it on create (A7)
 * and otherwise treats it as read-only (TC-44).
 *
 * Lock order (§11 "Projects", S8.2): the project row first, then conversation rows.
 * Every method must run inside TransactionManager.run().
 */
export interface ConversationMembership {
  /**
   * Locks (FOR UPDATE) a live conversation of `ownerId` and returns its current
   * project, or null when it does not exist / is deleted / is someone else's.
   */
  lockOwnedConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<{ projectId: string | null } | null>;
  setProject(
    conversationId: string,
    projectId: string | null,
    now: Date,
  ): Promise<void>;
  /** Detaches every conversation (deleted ones included) from the project; returns how many. */
  detachAll(projectId: string, now: Date): Promise<number>;
}
export const CONVERSATION_MEMBERSHIP = Symbol('CONVERSATION_MEMBERSHIP');
