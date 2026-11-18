import { IsNull, QueryFailedError } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import {
  parseSort,
  toPage,
  type Page,
  type PageRequest,
} from '@shared/pagination/page';
import { Conversation } from '../domain/conversation';
import {
  type ConversationListFilter,
  type ConversationRepository,
  ForkRequestTakenError,
} from '../application/ports';
import { ConversationRecord } from './conversation.record';

/** Same sortable fields as Python `ConversationOrderBy`. */
const SORTABLE = ['updatedAt', 'createdAt'] as const;
const SORT_COLUMN: Record<(typeof SORTABLE)[number], string> = {
  updatedAt: 'c.updated_at',
  createdAt: 'c.created_at',
};

const MESSAGE_MATCH = `EXISTS (
  SELECT 1 FROM messages m
   WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
     AND lower(m.content) LIKE :pattern)`;

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
    // Port of Python repositories/conversation.py (TC-31): term = strip().lower();
    // match lower(title) or the lower(content) of a live message (substring,
    // LIKE-escaped; the FTS index is NOT used by this endpoint in Python either).
    // The messages table is read by name (read-only), like TC-35.
    const term = filter.search?.trim().toLowerCase() ?? '';
    if (term) {
      query.setParameters({
        term,
        prefix: `${escapeLike(term)}%`,
        pattern: `%${escapeLike(term)}%`,
      });
      query.andWhere(`(lower(c.title) LIKE :pattern OR ${MESSAGE_MATCH})`);
      // With a search, Python ignores the requested sort and orders by relevance:
      // exact title 0, title prefix 1, title contains 2, message match 3.
      query
        .orderBy(
          `CASE WHEN lower(c.title) = :term THEN 0
                WHEN lower(c.title) LIKE :prefix THEN 1
                WHEN lower(c.title) LIKE :pattern THEN 2
                WHEN ${MESSAGE_MATCH} THEN 3 ELSE 4 END`,
          'ASC',
        )
        .addOrderBy('c.updated_at', 'DESC');
    } else {
      query.orderBy(SORT_COLUMN[sort.field], sort.direction);
    }
    const [records, total] = await query
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

  public async findForkRequest(
    ownerId: string,
    requestId: string,
  ): Promise<{ child: Conversation; fingerprint: string } | null> {
    const r = await this.repo.findOneBy({ ownerId, forkRequestId: requestId });
    return r
      ? { child: toDomain(r), fingerprint: r.forkRequestFingerprint ?? '' }
      : null;
  }

  public async insertFork(
    child: Conversation,
    request: { requestId: string; fingerprint: string },
  ): Promise<void> {
    try {
      await this.repo.insert({
        ...child.snapshot(),
        forkRequestId: request.requestId,
        forkRequestFingerprint: request.fingerprint,
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string; constraint?: string }).code ===
          '23505' &&
        (error.driverError as { constraint?: string }).constraint ===
          'uq_conversations_owner_fork_request'
      ) {
        throw new ForkRequestTakenError();
      }
      throw error;
    }
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
