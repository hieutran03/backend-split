import { ValidationError } from '@shared/errors/app-error';

/**
 * Conversation aggregate — `conversations` table (§6).
 *
 * Fork columns (forked_from_*, fork_request_*) are read-only here: they are written
 * by the fork use case (CONV-03). `nextMessageSequence` is advanced only by the
 * message writer (§11: UPDATE … RETURNING under a row lock), never by CRUD.
 */
export type PlanLifecycle =
  'draft' | 'ready' | 'executing' | 'paused' | 'completed';

export interface ConversationProps {
  readonly id: string;
  readonly ownerId: string;
  title: string;
  personaPrompt: string | null;
  planningModeEnabled: boolean;
  readonly planLifecycle: PlanLifecycle | null;
  readonly projectId: string | null;
  readonly nextMessageSequence: number;
  readonly forkedFromConversationId: string | null;
  readonly forkedFromMessageId: string | null;
  readonly forkedThroughSequence: number | null;
  readonly createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const TITLE_MAX = 255;
/** Same limit as Python `ConversationCreate.personaPrompt maxLength 8000`. */
export const PERSONA_PROMPT_MAX = 8000;

export class Conversation {
  private constructor(private readonly props: ConversationProps) {}

  public static start(input: {
    id: string;
    ownerId: string;
    title: string;
    personaPrompt?: string | null;
    planningModeEnabled?: boolean;
    projectId?: string | null;
    now: Date;
  }): Conversation {
    return new Conversation({
      id: input.id,
      ownerId: input.ownerId,
      title: Conversation.validTitle(input.title),
      personaPrompt: Conversation.validPersona(input.personaPrompt),
      planningModeEnabled: input.planningModeEnabled ?? false,
      planLifecycle: null,
      projectId: input.projectId ?? null,
      nextMessageSequence: 1,
      forkedFromConversationId: null,
      forkedFromMessageId: null,
      forkedThroughSequence: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
  }

  public static restore(props: ConversationProps): Conversation {
    return new Conversation({ ...props });
  }

  public get id(): string {
    return this.props.id;
  }

  /**
   * A11. `title` cannot be cleared; `personaPrompt: null` clears the persona;
   * `undefined` means "leave unchanged" for every field.
   */
  public update(
    changes: {
      title?: string;
      personaPrompt?: string | null;
      planningModeEnabled?: boolean;
    },
    now: Date,
  ): void {
    if (changes.title !== undefined) {
      this.props.title = Conversation.validTitle(changes.title);
    }
    if (changes.personaPrompt !== undefined) {
      this.props.personaPrompt = Conversation.validPersona(
        changes.personaPrompt,
      );
    }
    if (changes.planningModeEnabled !== undefined) {
      this.props.planningModeEnabled = changes.planningModeEnabled;
    }
    this.props.updatedAt = now;
  }

  /**
   * A12 — soft delete. Fork children are left untouched (spec A12). Deleting an
   * already deleted conversation is a no-op (the repository hides it anyway).
   */
  public softDelete(now: Date): void {
    if (this.props.deletedAt !== null) return;
    this.props.deletedAt = now;
    this.props.updatedAt = now;
  }

  public snapshot(): Readonly<ConversationProps> {
    return { ...this.props };
  }

  private static validTitle(title: string): string {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed.length > TITLE_MAX) {
      throw new ValidationError([
        {
          field: 'title',
          message: `must be between 1 and ${TITLE_MAX} characters`,
        },
      ]);
    }
    return trimmed;
  }

  /** Empty/blank persona is stored as null (no persona). */
  private static validPersona(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    if (value.length > PERSONA_PROMPT_MAX) {
      throw new ValidationError([
        {
          field: 'personaPrompt',
          message: `must be at most ${PERSONA_PROMPT_MAX} characters`,
        },
      ]);
    }
    return value.trim().length === 0 ? null : value;
  }
}
