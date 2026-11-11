import { type DbContext } from '@platform/database/db-context';
import type { ConversationMembership } from '../application/ports/conversation-membership';

/**
 * Writes `conversations.project_id` by table NAME — the only column of that table
 * the projects context owns (TC-44). No import of the conversations module's code.
 */
export class TypeOrmConversationMembership implements ConversationMembership {
  public constructor(private readonly db: DbContext) {}

  public async lockOwnedConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<{ projectId: string | null } | null> {
    const rows: Array<{ project_id: string | null }> =
      await this.db.manager.query(
        `SELECT project_id FROM conversations
          WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [conversationId, ownerId],
      );
    const row = rows[0];
    return row ? { projectId: row.project_id } : null;
  }

  public async setProject(
    conversationId: string,
    projectId: string | null,
    now: Date,
  ): Promise<void> {
    await this.db.manager.query(
      'UPDATE conversations SET project_id = $2, updated_at = $3 WHERE id = $1',
      [conversationId, projectId, now],
    );
  }

  public async detachAll(projectId: string, now: Date): Promise<number> {
    const result: unknown = await this.db.manager.query(
      'UPDATE conversations SET project_id = NULL, updated_at = $2 WHERE project_id = $1',
      [projectId, now],
    );
    return affectedRows(result);
  }
}

/** pg driver through TypeORM returns [rows, affectedCount] for UPDATE. */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') return result[1];
  return 0;
}
