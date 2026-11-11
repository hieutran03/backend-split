import type { Conversation, PlanLifecycle } from '../domain/conversation';

/**
 * Field names follow Python `ConversationRead`. Changes vs Python (A8/A9):
 *  - `customAgents` removed (never populated; use GET /conversations/{id}/custom-agents).
 *  - `messages` / `messageCount` arrive with CONV-04 (A9 include=messages).
 */
export interface ConversationView {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly personaPrompt: string | null;
  readonly planningModeEnabled: boolean;
  readonly planLifecycle: PlanLifecycle | null;
  readonly projectId: string | null;
  readonly forkedFromConversationId: string | null;
  readonly forkedFromMessageId: string | null;
  readonly forkedThroughSequence: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export function toConversationView(c: Conversation): ConversationView {
  const p = c.snapshot();
  return {
    id: p.id,
    ownerId: p.ownerId,
    title: p.title,
    personaPrompt: p.personaPrompt,
    planningModeEnabled: p.planningModeEnabled,
    planLifecycle: p.planLifecycle,
    projectId: p.projectId,
    forkedFromConversationId: p.forkedFromConversationId,
    forkedFromMessageId: p.forkedFromMessageId,
    forkedThroughSequence: p.forkedThroughSequence,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}
