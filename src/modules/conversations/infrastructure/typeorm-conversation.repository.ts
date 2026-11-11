import { IsNull } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import {
  parseSort,
  toPage,
  type Page,
  type PageRequest,
} from '@shared/pagination/page';
import { Conversation } from '../domain/conversation';
import type {
  ConversationListFilter,
  ConversationRepository,
} from '../application/ports';
import { ConversationRecord } from './conversation.record';

/** Same sortable fields as Python `ConversationOrderBy`. */
const SORTABLE = ['updatedAt', 'createdAt'] as const;
const SORT_COLUMN: Record<(typeof SORTABLE)[number], string> = {
  updatedAt: 'c.updated_at',
  createdAt: 'c.created_at',
};

export class TypeOrmConversationRepository implements ConversationRepository {
  public constructor(private readonly db: DbContext) {}

  private get repo() {
    return this.db.manager.getRepository(ConversationRecord);
  }

  public async findOwned(
    id: string,
    ownerId: string,
  ): Promise<Conversation | null> {
    const r = await this.repo.findOneBy({ id, ownerId, deletedAt: IsNull() });
    return r ? toDomain(r) : null;
  }

  public async findOwnedForUpdate(
    id: string,
    ownerId: string,
  ): Promise<Conversation | null> {
    const r = await this.repo.findOne({
      where: { id, ownerId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    return r ? toDomain(r) : null;
  }

  public async listOwned(
    ownerId: string,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<Page<Conversation>> {
    const sort = parseSort(page.sort, SORTABLE, {
      field: 'updatedAt',
      direction: 'DESC',
    });
    const query = this.repo
      .createQueryBuilder('c')
      .where('c.owner_id = :ownerId AND c.deleted_at IS NULL', { ownerId });
    if (filter.projectId) {
      query.andWhere('c.project_id = :projectId', {
        projectId: filter.projectId,
      });
    }
    if (filter.search) {
      // Title OR the content of a live message. The messages table is read by
      // name (read-only), like the messages context reads conversations (TC-35).
      // No FTS index yet (TC-36): substring ILIKE, as Python's description says.
      query.andWhere(
        `(c.title ILIKE :pattern OR EXISTS (
            SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
               AND m.content ILIKE :pattern))`,
        { pattern: `%${escapeLike(filter.search)}%` },
      );
    }
    const [records, total] = await query
      .orderBy(SORT_COLUMN[sort.field], sort.direction)
      .addOrderBy('c.id', 'ASC')
      .skip((page.page - 1) * page.limit)
      .take(page.limit)
      .getManyAndCount();
    return toPage(records.map(toDomain), total, page);
  }

  public async insert(conversation: Conversation): Promise<void> {
    const p = conversation.snapshot();
    await this.repo.insert({
      ...p,
      forkRequestId: null,
      forkRequestFingerprint: null,
    });
  }

  public async save(conversation: Conversation): Promise<void> {
    const p = conversation.snapshot();
    await this.repo.update(
      { id: p.id },
      {
        title: p.title,
        personaPrompt: p.personaPrompt,
        planningModeEnabled: p.planningModeEnabled,
        updatedAt: p.updatedAt,
        deletedAt: p.deletedAt,
      },
    );
  }
}

/** Treat `%`, `_` and `\` in user input literally inside ILIKE. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toDomain(r: ConversationRecord): Conversation {
  return Conversation.restore({
    id: r.id,
    ownerId: r.ownerId,
    title: r.title,
    personaPrompt: r.personaPrompt,
    planningModeEnabled: r.planningModeEnabled,
    planLifecycle: r.planLifecycle,
    projectId: r.projectId,
    nextMessageSequence: r.nextMessageSequence,
    forkedFromConversationId: r.forkedFromConversationId,
    forkedFromMessageId: r.forkedFromMessageId,
    forkedThroughSequence: r.forkedThroughSequence,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  });
}
