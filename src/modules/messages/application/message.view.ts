import type { Message, MessageSender } from '../domain/message';
import type { JsonObject } from '../domain/ui-message/py-compat';
import { sanitizePublicRichMetadata } from '../domain/ui-message/rich-sanitize';
import type { MessageFeedbackView } from './ports';

/**
 * Field names follow Python `MessageRead`, with S4 applied (`sender` is a string).
 * `feedback` only with include=feedback (null = no feedback yet).
 * Not here yet: `interrupt` (W4, HITL), `suggestedQuestions` (Python reads
 * them from message_metadata — TC-37).
 * `messageMetadata` is sanitized like Python `MessageRead`: private original-image
 * URLs never leave the API (sanitizePublicRichMetadata).
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
    messageMetadata: p.metadata
      ? sanitizePublicRichMetadata(p.metadata as JsonObject)
      : null,
    sequence: p.sequence,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}
