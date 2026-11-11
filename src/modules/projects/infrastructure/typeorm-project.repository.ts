import { IsNull } from 'typeorm';

import { type DbContext } from '@platform/database/db-context';
import {
  parseSort,
  toPage,
  type Page,
  type PageRequest,
} from '@shared/pagination/page';
import { Project } from '../domain/project';
import type { ProjectRepository } from '../application/ports/project.repository';
import { ProjectRecord } from './project.record';

const SORTABLE = ['createdAt', 'updatedAt', 'name'] as const;

export class TypeOrmProjectRepository implements ProjectRepository {
  public constructor(private readonly db: DbContext) {}

  private get repo() {
    // Always go through db.manager to join the current transaction automatically.
    return this.db.manager.getRepository(ProjectRecord);
  }

  public async findOwned(id: string, ownerId: string): Promise<Project | null> {
    const record = await this.repo.findOneBy({
      id,
      ownerId,
      deletedAt: IsNull(),
    });
    return record ? toDomain(record) : null;
  }

  public findOwnedForUpdate(
    id: string,
    ownerId: string,
  ): Promise<Project | null> {
    return this.findOwnedLocked(id, ownerId, 'pessimistic_write');
  }

  public findOwnedForShare(
    id: string,
    ownerId: string,
  ): Promise<Project | null> {
    return this.findOwnedLocked(id, ownerId, 'pessimistic_read');
  }

  private async findOwnedLocked(
    id: string,
    ownerId: string,
    mode: 'pessimistic_write' | 'pessimistic_read',
  ): Promise<Project | null> {
    const record = await this.repo.findOne({
      where: { id, ownerId, deletedAt: IsNull() },
      lock: { mode },
    });
    return record ? toDomain(record) : null;
  }

  public async listOwned(
    ownerId: string,
    page: PageRequest,
  ): Promise<Page<Project>> {
    const sort = parseSort(page.sort, SORTABLE, {
      field: 'updatedAt',
      direction: 'DESC',
    });
    const [records, total] = await this.repo.findAndCount({
      where: { ownerId, deletedAt: IsNull() },
      order: { [sort.field]: sort.direction, id: 'ASC' },
      skip: (page.page - 1) * page.limit,
      take: page.limit,
    });
    return toPage(records.map(toDomain), total, page);
  }

  public async insert(project: Project): Promise<void> {
    await this.repo.insert(toRecord(project));
  }

  public async save(project: Project): Promise<void> {
    const { id, ...rest } = toRecord(project);
    await this.repo.update({ id }, rest);
  }
}

function toDomain(r: ProjectRecord): Project {
  return Project.restore({
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  });
}

function toRecord(project: Project): ProjectRecord {
  const p = project.snapshot();
  const record = new ProjectRecord();
  Object.assign(record, p);
  return record;
}
