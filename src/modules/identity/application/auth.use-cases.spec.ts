import { FixedClock, SequentialIds } from '@test-support/fakes';
import {
  FakeAccessTokens,
  FakePasswordHasher,
  InMemoryUserRepository,
  RecordingRefreshTokens,
} from '@test-support/identity-fakes';
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '@shared/errors/app-error';
import { LoginUseCase, SignupUseCase } from './auth.use-cases';

function setup() {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const refresh = new RecordingRefreshTokens();
  const clock = new FixedClock();
  return {
    users,
    hasher,
    refresh,
    signup: new SignupUseCase(users, hasher, clock, new SequentialIds()),
    login: new LoginUseCase(
      users,
      hasher,
      new FakeAccessTokens(),
      refresh,
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
  it('tạo user role=user, token_version=0, lưu hash chứ không lưu mật khẩu thô', async () => {
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

  it('trùng email ⇒ 409 email_not_available', async () => {
    const s = setup();
    await s.signup.execute(valid);
    await expect(
      s.signup.execute({ ...valid, username: 'khac' }),
    ).rejects.toMatchObject({
      code: 'conflict',
      reason: 'email_not_available',
    });
  });

  it('trùng username ⇒ 409 username_not_available', async () => {
    const s = setup();
    await s.signup.execute(valid);
    const err = await s.signup
      .execute({ ...valid, email: 'khac@example.com' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).reason).toBe('username_not_available');
  });

  it('email của user ĐÃ XOÁ vẫn bị coi là trùng (unique index không lọc deleted_at)', async () => {
    const s = setup();
    const created = await s.signup.execute(valid);
    s.users.softDelete(created.id);
    await expect(
      s.signup.execute({ ...valid, username: 'moi' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('mật khẩu > 72 byte UTF-8 ⇒ 400 (bcrypt sẽ cắt âm thầm)', async () => {
    const s = setup();
    // 25 ký tự "ệ" = 75 byte nhưng chỉ 25 ký tự — lọt qua kiểm số ký tự.
    await expect(
      s.signup.execute({ ...valid, password: 'ệ'.repeat(25) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('mật khẩu < 8 ký tự ⇒ 400', async () => {
    const s = setup();
    await expect(
      s.signup.execute({ ...valid, password: 'short' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('LoginUseCase (A2)', () => {
  it('đúng thông tin ⇒ access + refresh opaque, tokenType bearer, ghi user-agent', async () => {
    const s = setup();
    const user = await s.signup.execute(valid);
    const tokens = await s.login.execute({
      email: valid.email,
      password: valid.password,
      userAgent: 'jest',
    });
    expect(tokens).toEqual({
      accessToken: `access:${user.id}:v0`,
      refreshToken: 'refresh-1',
      tokenType: 'bearer',
      expiresIn: 900,
      userId: user.id,
    });
    expect(s.refresh.issued).toEqual([{ userId: user.id, userAgent: 'jest' }]);
  });

  it('email có khoảng trắng thừa vẫn đăng nhập được', async () => {
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

  it('sai mật khẩu / email không tồn tại / user đã xoá ⇒ CÙNG một lỗi 401 invalid_credentials', async () => {
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
    expect(s.refresh.issued).toHaveLength(0);
  });

  it('email không tồn tại vẫn "đốt" thời gian băm (chống dò email qua độ trễ)', async () => {
    const s = setup();
    await s.login
      .execute({ email: 'nobody@example.com', password: 'x', userAgent: null })
      .catch(() => undefined);
    expect(s.hasher.burned).toBe(1);
  });
});
