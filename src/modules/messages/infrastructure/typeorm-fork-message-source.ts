import { type DbContext } from '@platform/database/db-context';
import { senderFromCode, type MessageSender } from '../domain/message';
import type { ForkMessageSource } from '../application/message-fork';

export class TypeOrmForkMessageSource implements ForkMessageSource {
  public constructor(private readonly db: DbContext) {}

  public async findMessage(
    conversationId: string,
    messageId: string,
  ): Promise<{ sequence: number; sender: MessageSender } | null> {
    const rows: Array<{ sequence: string; sender: number }> =
      await this.db.manager.query(
        `SELECT sequence, sender FROM messages
          WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL`,
        [messageId, conversationId],
      );
    const r = rows[0];
    return r
      ? { sequence: Number(r.sequence), sender: senderFromCode(r.sender) }
      : null;
  }

  /** Size = content + metadata JSON text, in bytes (TC-55). */
  public async prefixSize(
    conversationId: string,
    throughSequence: number,
  ): Promise<{ count: number; bytes: number }> {
    const rows: Array<{ count: string; bytes: string | null }> =
      await this.db.manager.query(
        `SELECT count(*) AS count,
                sum(octet_length(content)
                    + coalesce(octet_length(message_metadata::text), 0)) AS bytes
           FROM messages
          WHERE conversation_id = $1 AND deleted_at IS NULL AND sequence <= $2`,
        [conversationId, throughSequence],
      );
    return {
      count: Number(rows[0]?.count ?? 0),
      bytes: Number(rows[0]?.bytes ?? 0),
    };
  }

  public async copyPrefix(
    sourceId: string,
    childId: string,
    throughSequence: number,
  ): Promise<number> {
    const result: unknown[] = await this.db.manager.query(
      `INSERT INTO messages (id, conversation_id, sender, content, message_metadata,
                             sequence, created_at, updated_at, deleted_at)
       SELECT gen_random_uuid(), $2, sender, content, message_metadata,
              row_number() OVER (ORDER BY sequence), created_at, updated_at, NULL
         FROM messages
        WHERE conversation_id = $1 AND deleted_at IS NULL AND sequence <= $3
       RETURNING id`,
      [sourceId, childId, throughSequence],
    );
    // INSERT … RETURNING comes back as the returned rows.
    return Array.isArray(result) ? result.length : 0;
  }
}
