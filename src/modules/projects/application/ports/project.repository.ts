import type { Page, PageRequest } from '@shared/pagination/page';
import type { Project } from '../../domain/project';

/**
 * Outbound port defined by application — implemented by infrastructure.
 * Every query filters by owner + not deleted: not owned = does not exist (D15).
 */
export interface ProjectRepository {
  findOwned(id: string, ownerId: string): Promise<Project | null>;
  /** findOwned + FOR UPDATE (delete). Inside TransactionManager.run() only. */
  findOwnedForUpdate(id: string, ownerId: string): Promise<Project | null>;
  /**
   * findOwned + FOR SHARE: blocks a concurrent delete until the transaction ends
   * (attach, create a conversation in the project). Inside TransactionManager.run() only.
   */
  findOwnedForShare(id: string, ownerId: string): Promise<Project | null>;
  listOwned(ownerId: string, page: PageRequest): Promise<Page<Project>>;
  insert(project: Project): Promise<void>;
  save(project: Project): Promise<void>;
}

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
