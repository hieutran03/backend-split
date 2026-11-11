import type { Message, MessageSender } from '../domain/message';
import type { MessageFeedbackView } from './ports';

/**
 * Field names follow Python `MessageRead`, with S4 applied (`sender` is a string).
 * `feedback` only with include=feedback (null = no feedback yet).
 * Not here yet: `interrupt` (W4, HITL), `suggestedQuestions` (source not
 * confirmed — TC-37).
 */
export interface MessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly sender: MessageSender;
  readonly content: string;
  readonly messageMetadata: Record<string, unknown> | null;
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly feedback?: MessageFeedbackView | null;
}

export function toMessageView(m: Message): MessageView {
  const p = m.snapshot();
  return {
    id: p.id,
    conversationId: p.conversationId,
    sender: p.sender,
    content: p.content,
    messageMetadata: p.metadata,
    sequence: p.sequence,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}
