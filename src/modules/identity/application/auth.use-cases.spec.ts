import { FixedClock, SequentialIds } from '@test-support/fakes';
import {
  FakeAccessTokens,
  FakePasswordHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  SequentialTokenGenerator,
} from '@test-support/identity-fakes';
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '@shared/errors/app-error';
import { LoginUseCase, SignupUseCase } from './auth.use-cases';
import { RefreshTokenIssuer } from './refresh-token.issuer';

function setup() {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const refresh = new InMemoryRefreshTokenRepository();
  const clock = new FixedClock();
  const issuer = new RefreshTokenIssuer(
    refresh,
    new SequentialTokenGenerator(),
    new SequentialIds(),
    3600,
  );
  return {
    users,
    hasher,
    refresh,
    signup: new SignupUseCase(users, hasher, clock, new SequentialIds()),
    login: new LoginUseCase(
      users,
      hasher,
      new FakeAccessTokens(),
      issuer,
      clock,
    ),
  };
}

const valid = {
  username: 'hieu',
  email: 'hieu@example.com',
  password: 'secret-123',
};

describe('SignupUseCase (A1)', () => {
  it('creates user with role=user, token_version=0, stores the hash and not the raw password', async () => {
    const s = setup();
    const view = await s.signup.execute({ ...valid, username: '  hieu  ' });
    expect(view).toMatchObject({
      username: 'hieu',
      email: 'hieu@example.com',
      role: 'user',
      deletedAt: null,
    });
    expect(view).not.toHaveProperty('passwordHash');
    const stored = [...s.users.rows.values()][0]?.snapshot();
    expect(stored?.passwordHash).toBe('hashed:secret-123');
    expect(stored?.tokenVersion).toBe(0);
  });

  it('duplicate email ⇒ 409 email_not_available', async () => {
    const s = setup();
    await s.signup.execute(valid);
    await expect(
      s.signup.execute({ ...valid, username: 'khac' }),
    ).rejects.toMatchObject({
      code: 'conflict',
      reason: 'email_not_available',
    });
  });

  it('duplicate username ⇒ 409 username_not_available', async () => {
    const s = setup();
    await s.signup.execute(valid);
    const err = await s.signup
      .execute({ ...valid, email: 'khac@example.com' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).reason).toBe('username_not_available');
  });

  it('email of a DELETED user still counts as taken (unique index does not filter deleted_at)', async () => {
    const s = setup();
    const created = await s.signup.execute(valid);
    s.users.softDelete(created.id);
    await expect(
      s.signup.execute({ ...valid, username: 'moi' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('password > 72 UTF-8 bytes ⇒ 400 (bcrypt would silently truncate)', async () => {
    const s = setup();
    // 25 × "ệ" = 75 bytes but only 25 characters — passes the character-count check.
    await expect(
      s.signup.execute({ ...valid, password: 'ệ'.repeat(25) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('password < 8 characters ⇒ 400', async () => {
    const s = setup();
    await expect(
      s.signup.execute({ ...valid, password: 'short' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('LoginUseCase (A2)', () => {
  it('valid credentials ⇒ access + opaque refresh, tokenType bearer, records user-agent', async () => {
    const s = setup();
    const user = await s.signup.execute(valid);
    const tokens = await s.login.execute({
      email: valid.email,
      password: valid.password,
      userAgent: 'jest',
    });
    expect(tokens).toEqual({
      accessToken: `access:${user.id}:v0`,
      refreshToken: 'rt-1',
      tokenType: 'bearer',
      expiresIn: 900,
      userId: user.id,
    });
    expect(
      [...s.refresh.rows.values()].map((t) => ({
        userId: t.userId,
        userAgent: t.snapshot().userAgent,
        tokenHash: t.snapshot().tokenHash,
      })),
    ).toEqual([{ userId: user.id, userAgent: 'jest', tokenHash: 'h(rt-1)' }]);
  });

  it('email with surrounding whitespace can still log in', async () => {
    const s = setup();
    await s.signup.execute(valid);
    await expect(
      s.login.execute({
        email: `  ${valid.email} `,
        password: valid.password,
        userAgent: null,
      }),
    ).resolves.toHaveProperty('accessToken');
  });

  it('wrong password / unknown email / deleted user ⇒ the SAME 401 invalid_credentials error', async () => {
    const s = setup();
    const user = await s.signup.execute(valid);
    const attempts = [
      { email: valid.email, password: 'wrong-pass' },
      { email: 'nobody@example.com', password: valid.password },
    ];
    const errors = [];
    for (const a of attempts)
      errors.push(
        await s.login
          .execute({ ...a, userAgent: null })
          .catch((e: unknown) => e),
      );
    s.users.softDelete(user.id);
    errors.push(
      await s.login
        .execute({
          email: valid.email,
          password: valid.password,
          userAgent: null,
        })
        .catch((e: unknown) => e),
    );

    for (const e of errors) {
      expect(e).toBeInstanceOf(UnauthorizedError);
      expect(e).toMatchObject({
        reason: 'invalid_credentials',
        message: 'Invalid email or password',
      });
    }
    expect(s.refresh.rows.size).toBe(0);
  });

  it('unknown email still "burns" hashing time (prevents email probing via latency)', async () => {
    const s = setup();
    await s.login
      .execute({ email: 'nobody@example.com', password: 'x', userAgent: null })
      .catch(() => undefined);
    expect(s.hasher.burned).toBe(1);
  });
});
