import type { Actor } from '@shared/auth/actor';
import { NotFoundError } from '@shared/errors/app-error';
import type { UserRepository } from './ports';
import { toUserView, type UserView } from './views';

/**
 * A5 — The caller's own profile. The Python route took a path id
 * (`GET /users/{user_id}`) although only the own profile was allowed; the id is
 * dropped so there is nothing to tamper with.
 *
 * The guard already rejects deleted users, so a miss here only happens when the
 * account is deleted between the guard check and this read (or within the ≤ 30 s
 * guard cache window) — answered with 404 like any other missing resource (D15).
 */
export class GetMeUseCase {
  public constructor(private readonly users: UserRepository) {}

  public async execute(actor: Actor): Promise<UserView> {
    const user = await this.users.findActiveById(actor.userId);
    if (!user) throw new NotFoundError('user');
    return toUserView(user);
  }
}
