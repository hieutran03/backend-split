import type { ProjectLookup } from '@modules/projects/public-api';
import type { ProjectAccess } from '../application/ports';

/**
 * Integration adapter: conversations' own port (ProjectAccess) implemented with the
 * query the projects context exposes publicly. The two contexts never share
 * repositories or records.
 */
export class ProjectLookupAccessAdapter implements ProjectAccess {
  public constructor(private readonly projects: ProjectLookup) {}

  public lockOwnedActiveProject(
    ownerId: string,
    projectId: string,
  ): Promise<boolean> {
    return this.projects.lockOwnedActive(projectId, ownerId);
  }
}
