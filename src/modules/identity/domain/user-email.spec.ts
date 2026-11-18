import { User } from './user';

/** Expected values = the `.normalized` form Python stores (pydantic EmailStr). */
describe('User.normalizeEmail (Python email_validator normalized form)', () => {
  it.each([
    ['  Hieu@Example.COM ', 'Hieu@example.com'],
    ['hieu@example.com', 'hieu@example.com'],
    ['PostMaster@Example.com', 'postmaster@example.com'],
    ['Support@X.io', 'support@x.io'],
    ['Info.Team@X.io', 'Info.Team@x.io'],
  ])('%j ⇒ %j', (input, expected) => {
    expect(User.normalizeEmail(input)).toBe(expected);
  });
});
