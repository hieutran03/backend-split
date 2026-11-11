import { ValidationError } from '@shared/errors/app-error';

/**
 * Conversation aggregate — `conversations` table (§6).
 *
 * Fork columns (forked_from_*) are set only by `forkFrom` (A12a); fork_request_*
 * (idempotency) are stored by the repository alongside. `nextMessageSequence` is advanced only by the
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

  /**
   * A12a — the child of a fork: a copy of the source's settings, cut after the
   * source message `throughSequence`. Its own messages are the copied prefix,
   * numbered 1..copiedMessages, so the next one gets copiedMessages + 1.
   * Copied: persona, planning flag, project (TC-54). Not copied: plan lifecycle.
   */
  public static forkFrom(
    source: Conversation,
    input: {
      id: string;
      title?: string | null;
      messageId: string;
      throughSequence: number;
      copiedMessages: number;
      now: Date;
    },
  ): Conversation {
    const s = source.props;
    return new Conversation({
      id: input.id,
      ownerId: s.ownerId,
      title: Conversation.validTitle(input.title ?? s.title),
      personaPrompt: s.personaPrompt,
      planningModeEnabled: s.planningModeEnabled,
      planLifecycle: null,
      projectId: s.projectId,
      nextMessageSequence: input.copiedMessages + 1,
      forkedFromConversationId: s.id,
      forkedFromMessageId: input.messageId,
      forkedThroughSequence: input.throughSequence,
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

  public get isDeleted(): boolean {
    return this.props.deletedAt !== null;
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
