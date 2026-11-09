import { ValidationError } from '@shared/errors/app-error';

/**
 * Aggregate Project — thuần TypeScript, giữ invariant của project.
 *
 * Bảng `projects` (§6): owner_id, name varchar(255), description, instructions,
 * soft delete. `instructions` đi vào body E1 (projectInstructions).
 */
export interface ProjectProps {
  readonly id: string;
  readonly ownerId: string;
  name: string;
  description: string | null;
  instructions: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const PROJECT_NAME_MAX = 255;
export const PROJECT_INSTRUCTIONS_MAX = 20_000;

export class Project {
  private constructor(private readonly props: ProjectProps) {}

  public static create(input: {
    id: string;
    ownerId: string;
    name: string;
    description?: string | null;
    instructions?: string | null;
    now: Date;
  }): Project {
    return new Project({
      id: input.id,
      ownerId: input.ownerId,
      name: Project.validName(input.name),
      description: normalize(input.description),
      instructions: Project.validInstructions(input.instructions),
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
  }

  /** Dựng lại từ DB — không validate lại (dữ liệu cũ có thể không theo luật mới). */
  public static restore(props: ProjectProps): Project {
    return new Project({ ...props });
  }

  public get id(): string {
    return this.props.id;
  }
  public get ownerId(): string {
    return this.props.ownerId;
  }
  public get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  public isOwnedBy(userId: string): boolean {
    return this.props.ownerId === userId;
  }

  public update(
    changes: {
      name?: string;
      description?: string | null;
      instructions?: string | null;
    },
    now: Date,
  ): void {
    if (changes.name !== undefined)
      this.props.name = Project.validName(changes.name);
    if (changes.description !== undefined)
      this.props.description = normalize(changes.description);
    if (changes.instructions !== undefined) {
      this.props.instructions = Project.validInstructions(changes.instructions);
    }
    this.props.updatedAt = now;
  }

  public softDelete(now: Date): void {
    if (this.isDeleted) return;
    this.props.deletedAt = now;
    this.props.updatedAt = now;
  }

  public snapshot(): Readonly<ProjectProps> {
    return { ...this.props };
  }

  private static validName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > PROJECT_NAME_MAX) {
      throw new ValidationError([
        {
          field: 'name',
          message: `must be between 1 and ${PROJECT_NAME_MAX} characters`,
        },
      ]);
    }
    return trimmed;
  }

  private static validInstructions(
    value: string | null | undefined,
  ): string | null {
    const normalized = normalize(value);
    if (normalized !== null && normalized.length > PROJECT_INSTRUCTIONS_MAX) {
      throw new ValidationError([
        {
          field: 'instructions',
          message: `must be at most ${PROJECT_INSTRUCTIONS_MAX} characters`,
        },
      ]);
    }
    return normalized;
  }
}

function normalize(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
