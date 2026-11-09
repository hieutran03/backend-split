import {
  FixedClock,
  ImmediateTransactions,
  SequentialIds,
} from '@test-support/fakes';
import {
  FakeAccessTokens,
  FakeLegacyRefreshVerifier,
  FakePasswordHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  SequentialTokenGenerator,
} from '@test-support/identity-fakes';
import { UnauthorizedError, ValidationError } from '@shared/errors/app-error';
import { LoginUseCase, SignupUseCase } from './auth.use-cases';
import { RefreshTokenIssuer } from './refresh-token.issuer';
import { LogoutUseCase, RefreshUseCase } from './session.use-cases';

const TTL = 3600;

function setup(options: { legacyUntil?: Date | null } = {}) {
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryRefreshTokenRepository();
  const generator = new SequentialTokenGenerator();
  const ids = new SequentialIds();
  const clock = new FixedClock();
  const tx = new ImmediateTransactions();
  const hasher = new FakePasswordHasher();
  const access = new FakeAccessTokens();
  const issuer = new RefreshTokenIssuer(tokens, generator, ids, TTL);
  return {
    users,
    tokens,
    clock,
    tx,
    signup: new SignupUseCase(users, hasher, clock, ids),
    login: new LoginUseCase(users, hasher, access, issuer, clock),
    refresh: new RefreshUseCase(
      users,
      tokens,
      issuer,
      generator,
      new FakeLegacyRefreshVerifier(),
      access,
      tx,
      clock,
      ids,
      options.legacyUntil ?? null,
    ),
    logout: new LogoutUseCase(tokens, generator, tx, clock),
  };
}

async function loggedIn(s: ReturnType<typeof setup>, name = 'hieu') {
  const user = await s.signup.execute({
    username: name,
    email: `${name}@example.com`,
    password: 'secret-123',
  });
  const tokens = await s.login.execute({
    email: `${name}@example.com`,
    password: 'secret-123',
    userAgent: null,
  });
  return { user, refreshToken: tokens.refreshToken };
}

async function rejection(
  promise: Promise<unknown>,
): Promise<UnauthorizedError> {
  const error = await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UnauthorizedError);
  return error as UnauthorizedError;
}

describe('RefreshUseCase (A3)', () => {
  it('rotates: new pair returned, old token revoked and pointing at its successor', async () => {
    const s = setup();
    const { user, refreshToken } = await loggedIn(s);

    const next = await s.refresh.execute({ refreshToken, userAgent: 'jest' });

    expect(next).toMatchObject({
      refreshToken: 'rt-2',
      accessToken: `access:${user.id}:v0`,
      tokenType: 'bearer',
      expiresIn: 900,
      userId: user.id,
    });
    const old = await s.tokens.findByHashForUpdate('h(rt-1)');
    const successor = await s.tokens.findByHashForUpdate('h(rt-2)');
    expect(old?.isRevoked).toBe(true);
    expect(old?.snapshot().replacedById).toBe(successor?.id);
    expect(successor?.isRevoked).toBe(false);
    expect(s.tx.runs).toBe(1);
  });

  it('reuse of a rotated token ⇒ 401 refresh_token_reused AND the whole chain is revoked', async () => {
    const s = setup();
    const { refreshToken } = await loggedIn(s);
    const r2 = await s.refresh.execute({ refreshToken, userAgent: null });
    const r3 = await s.refresh.execute({
      refreshToken: r2.refreshToken,
      userAgent: null,
    });

    // An attacker replays the very first token.
    const error = await rejection(
      s.refresh.execute({ refreshToken, userAgent: null }),
    );
    expect(error.reason).toBe('refresh_token_reused');

    // The legitimate holder's current token (rt-3) is dead too — the revocation was
    // returned (not thrown) from the transaction, so it is kept.
    expect(s.tokens.active()).toHaveLength(0);
    const legit = await rejection(
      s.refresh.execute({ refreshToken: r3.refreshToken, userAgent: null }),
    );
    expect(legit.reason).toBe('refresh_token_reused');
  });

  it('unknown token ⇒ 401 invalid_refresh_token', async () => {
    const s = setup();
    const error = await rejection(
      s.refresh.execute({ refreshToken: 'nope', userAgent: null }),
    );
    expect(error.reason).toBe('invalid_refresh_token');
  });

  it('expired token ⇒ 401 refresh_token_expired', async () => {
    const s = setup();
    const { refreshToken } = await loggedIn(s);
    s.clock.advance(TTL * 1000);
    const error = await rejection(
      s.refresh.execute({ refreshToken, userAgent: null }),
    );
    expect(error.reason).toBe('refresh_token_expired');
  });

  it('deleted user ⇒ 401 invalid_refresh_token and the token is revoked', async () => {
    const s = setup();
    const { user, refreshToken } = await loggedIn(s);
    s.users.softDelete(user.id);
    const error = await rejection(
      s.refresh.execute({ refreshToken, userAgent: null }),
    );
    expect(error.reason).toBe('invalid_refresh_token');
    expect(s.tokens.active()).toHaveLength(0);
  });
});

describe('RefreshUseCase — legacy Python refresh JWT (D19)', () => {
  const future = new Date('2026-11-16T00:00:00.000Z'); // FixedClock is 2026-11-09

  it('window not configured ⇒ 401 legacy_refresh_not_accepted', async () => {
    const s = setup({ legacyUntil: null });
    const { user } = await loggedIn(s);
    const error = await rejection(
      s.refresh.execute({
        refreshToken: `legacy.${user.id}.v0`,
        userAgent: null,
      }),
    );
    expect(error.reason).toBe('legacy_refresh_not_accepted');
  });

  it('window closed ⇒ 401 legacy_refresh_not_accepted', async () => {
    const s = setup({ legacyUntil: new Date('2026-11-01T00:00:00.000Z') });
    const { user } = await loggedIn(s);
    const error = await rejection(
      s.refresh.execute({
        refreshToken: `legacy.${user.id}.v0`,
        userAgent: null,
      }),
    );
    expect(error.reason).toBe('legacy_refresh_not_accepted');
  });

  it('exchanged ONCE for an opaque token; a second exchange counts as reuse', async () => {
    const s = setup({ legacyUntil: future });
    const { user } = await loggedIn(s);
    const legacy = `legacy.${user.id}.v0`;

    const first = await s.refresh.execute({
      refreshToken: legacy,
      userAgent: null,
    });
    expect(first.refreshToken).toMatch(/^rt-/);
    expect(first.userId).toBe(user.id);

    const again = await rejection(
      s.refresh.execute({ refreshToken: legacy, userAgent: null }),
    );
    expect(again.reason).toBe('refresh_token_reused');
    // The token obtained from the first exchange is revoked with the chain.
    const fromExchange = await rejection(
      s.refresh.execute({ refreshToken: first.refreshToken, userAgent: null }),
    );
    expect(fromExchange.reason).toBe('refresh_token_reused');
  });

  it('token_version mismatch ⇒ 401 invalid_refresh_token', async () => {
    const s = setup({ legacyUntil: future });
    const { user } = await loggedIn(s);
    const error = await rejection(
      s.refresh.execute({
        refreshToken: `legacy.${user.id}.v7`,
        userAgent: null,
      }),
    );
    expect(error.reason).toBe('invalid_refresh_token');
  });
});

describe('LogoutUseCase (A4)', () => {
  const actorOf = (userId: string) => ({ userId, isAdmin: false });

  it('revokes the given refresh token; it can no longer be used', async () => {
    const s = setup();
    const { user, refreshToken } = await loggedIn(s);
    await expect(
      s.logout.execute(actorOf(user.id), { refreshToken }),
    ).resolves.toEqual({ revokedCount: 1 });
    await rejection(s.refresh.execute({ refreshToken, userAgent: null }));
  });

  it('another user’s token ⇒ revokedCount 0 and the token stays valid', async () => {
    const s = setup();
    const victim = await loggedIn(s, 'victim');
    const attacker = await loggedIn(s, 'attacker');
    await expect(
      s.logout.execute(actorOf(attacker.user.id), {
        refreshToken: victim.refreshToken,
      }),
    ).resolves.toEqual({ revokedCount: 0 });
    await expect(
      s.refresh.execute({ refreshToken: victim.refreshToken, userAgent: null }),
    ).resolves.toHaveProperty('accessToken');
  });

  it('allDevices revokes every token of the caller only', async () => {
    const s = setup();
    const me = await loggedIn(s, 'myself');
    await s.login.execute({
      email: 'myself@example.com',
      password: 'secret-123',
      userAgent: 'phone',
    });
    const other = await loggedIn(s, 'other');

    await expect(
      s.logout.execute(actorOf(me.user.id), { allDevices: true }),
    ).resolves.toEqual({ revokedCount: 2 });
    expect(s.tokens.active().map((t) => t.userId)).toEqual([other.user.id]);
  });

  it('neither refreshToken nor allDevices ⇒ 400', async () => {
    const s = setup();
    const { user } = await loggedIn(s);
    await expect(s.logout.execute(actorOf(user.id), {})).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
