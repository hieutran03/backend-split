import type { SelectQueryBuilder } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import {
  parseSort,
  toPage,
  type Page,
  type PageRequest,
} from '@shared/pagination/page';
import { Message, senderFromCode } from '../domain/message';
import {
  MESSAGE_SORTABLE,
  type MessageFeedbackView,
  type MessageListFilter,
  type MessageRepository,
  type MessageSort,
} from '../application/ports';
import { MessageRecord } from './message.record';

const COLUMN: Record<MessageSort['field'], string> = {
  sequence: 'm.sequence',
  createdAt: 'm.created_at',
  updatedAt: 'm.updated_at',
};

/**
 * Ownership lives on `conversations.owner_id`, so every query joins the
 * `conversations` table by NAME (read-only; this context does not import the
 * conversations module's code — TC-35). A20 needs this join anyway.
 */
export class TypeOrmMessageRepository implements MessageRepository {
  public constructor(private readonly db: DbContext) {}

  private visibleTo(ownerId: string): SelectQueryBuilder<MessageRecord> {
    return this.db.manager
      .getRepository(MessageRecord)
      .createQueryBuilder('m')
      .innerJoin(
        'conversations',
        'c',
        'c.id = m.conversation_id AND c.deleted_at IS NULL AND c.owner_id = :ownerId',
        { ownerId },
      )
      .where('m.deleted_at IS NULL');
  }

  public async findOwned(id: string, ownerId: string): Promise<Message | null> {
    const r = await this.visibleTo(ownerId)
      .andWhere('m.id = :id', { id })
      .getOne();
    return r ? toDomain(r) : null;
  }

  public async ownsConversation(
    conversationId: string,
    ownerId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await this.db.manager.query(
      'SELECT 1 FROM conversations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
      [conversationId, ownerId],
    );
    return rows.length > 0;
  }

  public async listOwned(
    ownerId: string,
    filter: MessageListFilter,
    page: PageRequest,
    defaultSort: MessageSort,
  ): Promise<Page<Message>> {
    const sort = parseSort(page.sort, MESSAGE_SORTABLE, defaultSort);
    const query = this.visibleTo(ownerId);
    if (filter.conversationId) {
      query.andWhere('m.conversation_id = :conversationId', {
        conversationId: filter.conversationId,
      });
    }
    const [records, total] = await query
      .orderBy(COLUMN[sort.field], sort.direction)
      .addOrderBy('m.id', 'ASC')
      .skip((page.page - 1) * page.limit)
      .take(page.limit)
      .getManyAndCount();
    return toPage(records.map(toDomain), total, page);
  }

  public async feedbackFor(
    messageIds: string[],
    userId: string,
  ): Promise<Map<string, MessageFeedbackView>> {
    if (messageIds.length === 0) return new Map();
    const rows: FeedbackRow[] = await this.db.manager.query(
      `SELECT id, message_id, user_id, rating, comment, created_at, updated_at, deleted_at
         FROM feedbacks
        WHERE message_id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL`,
      [messageIds, userId],
    );
    return new Map(
      rows.map((f) => [
        f.message_id,
        {
          id: f.id,
          messageId: f.message_id,
          userId: f.user_id,
          rating: f.rating,
          comment: f.comment,
          createdAt: f.created_at.toISOString(),
          updatedAt: f.updated_at.toISOString(),
          deletedAt: f.deleted_at ? f.deleted_at.toISOString() : null,
        },
      ]),
    );
  }
}

interface FeedbackRow {
  id: string;
  message_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toDomain(r: MessageRecord): Message {
  return Message.restore({
    id: r.id,
    conversationId: r.conversationId,
    sender: senderFromCode(r.sender),
    content: r.content,
    metadata: r.messageMetadata,
    sequence: r.sequence,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  });
}
