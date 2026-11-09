/** Authenticated caller — the application layer receives this, not the Request. */
export interface Actor {
  readonly userId: string;
  /** Currently ADMIN_USER_IDS in env; after S1 it becomes users.role = 'admin'. */
  readonly isAdmin: boolean;
}
