import { ConflictError, UnauthorizedError } from '@shared/errors/app-error';
import type { Clock, IdGenerator } from '@platform/ports/kernel.port';
import { assertPasswordAcceptable } from '../domain/password-policy';
import { User } from '../domain/user';
import type {
  AccessTokenIssuer,
  PasswordHasher,
  RefreshTokenStore,
  UserRepository,
} from './ports';
import { toUserView, type TokenView, type UserView } from './views';

export interface SignupInput {
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly avatarUrl?: string | null;
}

/**
 * A1 — Signup. Duplicate email/username ⇒ 409 (old Python returned 422).
 * Two-layer duplicate check: query first (clear message on which field clashes) + DB unique index
 * (stops two concurrent requests that both slip past the query).
 */
export class SignupUseCase {
  public constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(input: SignupInput): Promise<UserView> {
    assertPasswordAcceptable(input.password);
    const email = User.normalizeEmail(input.email);
    const username = input.username.trim();

    if (await this.users.emailExists(email)) {
      throw new ConflictError(
        'Email is already registered',
        'email_not_available',
      );
    }
    if (await this.users.usernameExists(username)) {
      throw new ConflictError(
        'Username is already taken',
        'username_not_available',
      );
    }

    const user = User.register({
      id: this.ids.uuid(),
      username,
      email,
      passwordHash: await this.hasher.hash(input.password),
      avatarUrl: input.avatarUrl,
      now: this.clock.now(),
    });
    await this.users.insert(user);
    return toUserView(user);
  }
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly userAgent: string | null;
}

/**
 * A2 — Login. Every kind of failure (unknown email, deleted user, wrong password)
 * returns the SAME 401 `invalid_credentials` error and takes the SAME time — no way
 * to guess which emails are registered.
 */
export class LoginUseCase {
  public constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly clock: Clock,
  ) {}

  public async execute(input: LoginInput): Promise<TokenView> {
    const user = await this.users.findActiveByEmail(input.email.trim());
    if (!user) {
      await this.hasher.burnTime(input.password);
      throw invalidCredentials();
    }
    if (!(await this.hasher.verify(input.password, user.passwordHash))) {
      throw invalidCredentials();
    }

    const access = this.accessTokens.issue(user.id, user.tokenVersion);
    const refresh = await this.refreshTokens.issue({
      userId: user.id,
      userAgent: input.userAgent,
      now: this.clock.now(),
    });
    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenType: 'bearer',
      expiresIn: access.expiresIn,
      userId: user.id,
    };
  }
}

function invalidCredentials(): UnauthorizedError {
  return new UnauthorizedError(
    'Invalid email or password',
    'invalid_credentials',
  );
}
