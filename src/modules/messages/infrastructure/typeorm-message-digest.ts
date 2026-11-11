import { type DbContext } from '@platform/database/db-context';
import { Message, senderFromCode } from '../domain/message';
import type { ConversationMessageDigest } from '../application/message-digest';
import { toMessageView, type MessageView } from '../application/message.view';

interface CountRow {
  conversation_id: string;
  count: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: number;
  content: string;
  message_metadata: Record<string, unknown> | null;
  sequence: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Two set-based queries per page of conversations (no N+1). Both are served by
 * ix_messages_prompt_history (conversation_id, sequence) WHERE deleted_at IS NULL.
 */
export class TypeOrmConversationMessageDigest implements ConversationMessageDigest {
  public constructor(private readonly db: DbContext) {}

  public async countByConversation(
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    const rows: CountRow[] = await this.db.manager.query(
      `SELECT conversation_id, count(*) AS count
         FROM messages
        WHERE conversation_id = ANY($1::uuid[]) AND deleted_at IS NULL
        GROUP BY conversation_id`,
      [conversationIds],
    );
    return new Map(rows.map((r) => [r.conversation_id, Number(r.count)]));
  }

  public async latestByConversation(
    conversationIds: string[],
    perConversation: number,
  ): Promise<Map<string, MessageView[]>> {
    const result = new Map<string, MessageView[]>();
    if (conversationIds.length === 0 || perConversation <= 0) return result;
    const rows: MessageRow[] = await this.db.manager.query(
      `SELECT id, conversation_id, sender, content, message_metadata, sequence,
              created_at, updated_at, deleted_at
         FROM (
           SELECT m.*, row_number() OVER (
                    PARTITION BY m.conversation_id ORDER BY m.sequence DESC) AS rn
             FROM messages m
            WHERE m.conversation_id = ANY($1::uuid[]) AND m.deleted_at IS NULL
         ) latest
        WHERE rn <= $2
        ORDER BY conversation_id, sequence DESC`,
      [conversationIds, perConversation],
    );
    for (const r of rows) {
      const list = result.get(r.conversation_id) ?? [];
      list.push(toMessageView(toDomain(r)));
      result.set(r.conversation_id, list);
    }
    return result;
  }
}

function toDomain(r: MessageRow): Message {
  return Message.restore({
    id: r.id,
    conversationId: r.conversation_id,
    sender: senderFromCode(r.sender),
    content: r.content,
    metadata: r.message_metadata,
    sequence: Number(r.sequence),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  });
}
