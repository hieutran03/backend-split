import type { Page, PageRequest } from '@shared/pagination/page';
import type { Project } from '../../domain/project';

/**
 * Port outbound do application định nghĩa — infrastructure implement.
 * Mọi truy vấn đều lọc theo owner + chưa xoá: không sở hữu = không tồn tại (D15).
 */
export interface ProjectRepository {
  findOwned(id: string, ownerId: string): Promise<Project | null>;
  listOwned(ownerId: string, page: PageRequest): Promise<Page<Project>>;
  insert(project: Project): Promise<void>;
  save(project: Project): Promise<void>;
}

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
