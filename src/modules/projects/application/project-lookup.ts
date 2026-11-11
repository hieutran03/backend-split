import type { ProjectRepository } from './ports/project.repository';

/**
 * Read-only query the projects context offers to OTHER contexts (exported through
 * public-api.ts). Callers describe their own need with their own port and adapt to
 * this one — e.g. conversations' ProjectAccess.
 */
export interface ProjectLookup {
  /** true when the project exists, is not deleted and belongs to `ownerId`. */
  isOwnedActive(projectId: string, ownerId: string): Promise<boolean>;
  /**
   * Same check, and share-locks the project until the caller's transaction ends,
   * so it cannot be deleted meanwhile. Inside TransactionManager.run() only.
   */
  lockOwnedActive(projectId: string, ownerId: string): Promise<boolean>;
}
export const PROJECT_LOOKUP = Symbol('PROJECT_LOOKUP');

export class RepositoryProjectLookup implements ProjectLookup {
  public constructor(private readonly projects: ProjectRepository) {}

  public async isOwnedActive(
    projectId: string,
    ownerId: string,
  ): Promise<boolean> {
    return (await this.projects.findOwned(projectId, ownerId)) !== null;
  }

  public async lockOwnedActive(
    projectId: string,
    ownerId: string,
  ): Promise<boolean> {
    return (await this.projects.findOwnedForShare(projectId, ownerId)) !== null;
  }
}
