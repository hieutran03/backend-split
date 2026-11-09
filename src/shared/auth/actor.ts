/** Người gọi đã xác thực — application nhận cái này, không nhận Request. */
export interface Actor {
  readonly userId: string;
  /** Hiện là ADMIN_USER_IDS trong env; sau S1 là users.role = 'admin'. */
  readonly isAdmin: boolean;
}
