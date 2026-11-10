import type { Page, PageRequest } from '@shared/pagination/page';
import type { Conversation } from '../domain/conversation';

export interface ConversationListFilter {
  readonly projectId?: string | undefined;
  /** Case-insensitive match on the title (message content search comes with MSG-01). */
  readonly search?: string | undefined;
}

/** Every query is scoped to owner + not deleted: not owned = does not exist (D15). */
export interface ConversationRepository {
  findOwned(id: string, ownerId: string): Promise<Conversation | null>;
  listOwned(
    ownerId: string,
    filter: ConversationListFilter,
    page: PageRequest,
  ): Promise<Page<Conversation>>;
  insert(conversation: Conversation): Promise<void>;
  /** Persists the mutable CRUD fields only (title, persona, planning flag, timestamps). */
  save(conversation: Conversation): Promise<void>;
}
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/**
 * What this context needs from the projects context, in its own words.
 * Wired to the projects public API by an adapter (integration through a port).
 */
export interface ProjectAccess {
  /** true when the project exists, is not deleted and belongs to `ownerId`. */
  ownsActiveProject(ownerId: string, projectId: string): Promise<boolean>;
}
export const PROJECT_ACCESS = Symbol('PROJECT_ACCESS');
