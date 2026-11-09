import type { Project } from '../domain/project';

/** Dữ liệu trả ra ngoài (camelCase, ISO date). Không trả domain object ra controller. */
export interface ProjectView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toProjectView(project: Project): ProjectView {
  const p = project.snapshot();
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    instructions: p.instructions,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
