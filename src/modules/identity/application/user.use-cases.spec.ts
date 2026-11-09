import { FixedClock, SequentialIds } from '@test-support/fakes';
import {
  FakePasswordHasher,
  InMemoryUserRepository,
} from '@test-support/identity-fakes';
import { NotFoundError } from '@shared/errors/app-error';
import { SignupUseCase } from './auth.use-cases';
import { GetMeUseCase } from './user.use-cases';

function setup() {
  const users = new InMemoryUserRepository();
  return {
    users,
    signup: new SignupUseCase(
      users,
      new FakePasswordHasher(),
      new FixedClock(),
      new SequentialIds(),
    ),
    getMe: new GetMeUseCase(users),
  };
}

describe('GetMeUseCase (A5)', () => {
  it('returns the caller profile without the password hash', async () => {
    const s = setup();
    const created = await s.signup.execute({
      username: 'hieu',
      email: 'hieu@example.com',
      password: 'secret-123',
    });
    const me = await s.getMe.execute({ userId: created.id, isAdmin: false });
    expect(me).toEqual(created);
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('deleted between guard and read ⇒ 404 user_not_found', async () => {
    const s = setup();
    const created = await s.signup.execute({
      username: 'gone',
      email: 'gone@example.com',
      password: 'secret-123',
    });
    s.users.softDelete(created.id);
    const error = await s.getMe
      .execute({ userId: created.id, isAdmin: false })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).reason).toBe('user_not_found');
  });
});
