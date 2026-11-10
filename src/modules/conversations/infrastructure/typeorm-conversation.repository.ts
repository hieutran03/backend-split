import { type FindOptionsWhere, ILike, IsNull } from 'typeorm';

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

  public async listOwned(
    ownerId: string,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<Page<Conversation>> {
    const sort = parseSort(page.sort, SORTABLE, {
      field: 'updatedAt',
      direction: 'DESC',
    });
    const where: FindOptionsWhere<ConversationRecord> = {
      ownerId,
      deletedAt: IsNull(),
    };
    if (filter.projectId) where.projectId = filter.projectId;
    if (filter.search) where.title = ILike(`%${escapeLike(filter.search)}%`);

    const [records, total] = await this.repo.findAndCount({
      where,
      order: { [sort.field]: sort.direction, id: 'ASC' },
      skip: (page.page - 1) * page.limit,
      take: page.limit,
    });
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
