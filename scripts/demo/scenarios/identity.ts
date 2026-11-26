import jwt from 'jsonwebtoken';

import type { DemoContext, Scenario, UserSession } from '../context';
import type { Json } from '../kit';
import { ALICE, BOB, ensureUsers, login } from './fixtures';

function claimsOf(token: string): Json {
  return jwt.decode(token);
}

export const authScenario: Scenario = {
  id: 'auth',
  title: 'Sign up, log in, refresh, log out',
  tasks: 'AUTH-01, AUTH-02, USR-01, SYNC-02',
  apis: 'A1, A2, A3, A4, A5',
  journal: 'docs/journal/005, 006, 008, 019',
  summary:
    'bcrypt $2b$ cost 12 like Python, email normalisation, opaque refresh tokens that rotate and revoke the whole chain when an old one is reused.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;

    ctx.step(
      'Sign up alice (A1)',
      `Email sent as "${ALICE.email}": the domain gets lower-cased, the local part keeps its case (TC-17).`,
    );
    let res = await api.post('/auth/signup', {
      body: {
        username: ALICE.username,
        email: ALICE.email,
        password: ALICE.password,
      },
    });
    ctx.expect(res, 201);
    ctx.equal('stored email', res.data?.email, ALICE.normalizedEmail);
    ctx.equal('role', res.data?.role, 'user');
    ctx.check(
      'no password or hash in the response',
      !JSON.stringify(res.body).includes('password'),
    );
    await ctx.sql(
      'the hash is bcrypt $2b$ cost 12, the format Python app/core/security/password.py checks',
      `SELECT username, email, left(password_hash, 7) AS hash_prefix, length(password_hash) AS hash_len, token_version, role
         FROM users WHERE username = $1`,
      [ALICE.username],
    );

    ctx.step(
      'Sign up again with the same email in another case (A1)',
      'Duplicate email ⇒ 409 (Python returned 422).',
    );
    res = await api.post('/auth/signup', {
      body: {
        username: 'alice2',
        email: ' Alice.Demo@EXAMPLE.com ',
        password: ALICE.password,
      },
    });
    ctx.expect(res, 409, 'email_not_available');

    ctx.step('Sign up with a taken username (A1)');
    res = await api.post('/auth/signup', {
      body: {
        username: ALICE.username,
        email: 'someone@example.com',
        password: ALICE.password,
      },
    });
    ctx.expect(res, 409, 'username_not_available');

    ctx.step(
      'Sign up with invalid fields (A1)',
      'zod validation ⇒ 400 with one entry per field.',
    );
    res = await api.post('/auth/signup', {
      body: { username: 'x', email: 'not-an-email', password: '123' },
    });
    ctx.expectInvalid(res, 'username', 'email', 'password');

    ctx.step('Sign up bob (second user for the ownership checks)');
    res = await api.post('/auth/signup', {
      body: {
        username: BOB.username,
        email: BOB.email,
        password: BOB.password,
      },
    });
    ctx.expect(res, 201);

    ctx.step(
      'Log in with a wrong password (A2)',
      'Unknown email, wrong password and deleted account all give the same 401.',
    );
    res = await api.post('/auth/login', {
      body: { email: ALICE.email, password: 'wrong-password' },
    });
    ctx.expect(res, 401, 'invalid_credentials');

    ctx.step(
      'Log in with the local part in another case (A2)',
      'The local part is case-sensitive, as in Python ⇒ no match.',
    );
    res = await api.post('/auth/login', {
      body: { email: 'alice.demo@example.com', password: ALICE.password },
    });
    ctx.expect(res, 401, 'invalid_credentials');

    ctx.step(
      'Log in alice with spaces and an upper-case domain (A2)',
      'Same normalisation as signup ⇒ found.',
    );
    res = await api.post('/auth/login', {
      body: { email: '  Alice.Demo@EXAMPLE.COM ', password: ALICE.password },
    });
    ctx.expect(res, 200);
    const first: Json = res.data;
    ctx.equal('tokenType', first?.tokenType, 'bearer');
    ctx.equal('expiresIn (15 min)', first?.expiresIn, 900);
    ctx.check(
      'refresh token is opaque (not a JWT)',
      typeof first?.refreshToken === 'string' &&
        first.refreshToken.split('.').length !== 3,
    );
    const claims = claimsOf(String(first?.accessToken));
    ctx.note(`access token claims: ${JSON.stringify(claims)}`);
    ctx.equal('claim type', claims?.type, 'access');
    ctx.equal('claim ver', claims?.ver, 0);
    let alice: UserSession = {
      label: 'alice',
      token: String(first?.accessToken),
      refreshToken: String(first?.refreshToken),
      userId: String(first?.userId),
      email: ALICE.email,
      password: ALICE.password,
    };

    ctx.step('Call /users/me without a token (A5)');
    res = await api.get('/users/me');
    ctx.expect(res, 401, 'missing_token');

    ctx.step('Call /users/me as alice (A5)');
    res = await api.get('/users/me', { as: alice });
    ctx.expect(res, 200);
    ctx.equal('id', res.data?.id, alice.userId);

    ctx.step(
      'Rotate the refresh token (A3)',
      'Single use: the old token is revoked and points to its successor (replaced_by_id).',
    );
    res = await api.post('/auth/refresh', {
      body: { refreshToken: alice.refreshToken },
    });
    ctx.expect(res, 200);
    const oldRefresh = alice.refreshToken;
    alice = {
      ...alice,
      token: String(res.data?.accessToken),
      refreshToken: String(res.data?.refreshToken),
    };
    ctx.check(
      'a new refresh token is issued',
      alice.refreshToken !== oldRefresh,
    );
    await ctx.sql(
      'the rotation chain of alice',
      `SELECT id, replaced_by_id, revoked_at IS NOT NULL AS revoked, left(token_hash, 12) AS sha256_prefix
         FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at`,
      [alice.userId],
    );

    ctx.step(
      'Reuse the OLD refresh token (A3)',
      'Reuse = probable theft ⇒ 401 and the whole chain is revoked, including the newest token.',
    );
    res = await api.post('/auth/refresh', {
      body: { refreshToken: oldRefresh },
    });
    ctx.expect(res, 401, 'refresh_token_reused');
    res = await api.post('/auth/refresh', {
      body: { refreshToken: alice.refreshToken },
    });
    ctx.expect(res, 401, 'refresh_token_reused');
    await ctx.sql(
      'every link is revoked now',
      `SELECT count(*)::int AS tokens, count(revoked_at)::int AS revoked FROM refresh_tokens WHERE user_id = $1`,
      [alice.userId],
    );

    ctx.step(
      'Log in again and log out with the refresh token (A4)',
      'Logout really revokes (Python only acknowledged).',
    );
    alice = await login(ctx, 'alice', ALICE.email, ALICE.password);
    res = await api.post('/auth/logout', {
      as: alice,
      body: { refreshToken: alice.refreshToken },
    });
    ctx.expect(res, 200);
    ctx.equal('revokedCount', res.data?.revokedCount, 1);
    res = await api.post('/auth/refresh', {
      body: { refreshToken: alice.refreshToken },
    });
    ctx.expect(res, 401, 'refresh_token_reused');
    ctx.note(
      'The access token stays valid until it expires (≤ 15 min, TC-22).',
    );
    res = await api.get('/users/me', { as: alice });
    ctx.expect(res, 200);

    ctx.step('Log out from all devices (A4)');
    alice = await login(ctx, 'alice', ALICE.email, ALICE.password);
    await login(ctx, 'alice (2nd device)', ALICE.email, ALICE.password);
    res = await api.post('/auth/logout', {
      as: alice,
      body: { allDevices: true },
    });
    ctx.expect(res, 200);
    ctx.equal('revokedCount', res.data?.revokedCount, 2);

    ctx.state.alice = await login(ctx, 'alice', ALICE.email, ALICE.password);
    ctx.state.bob = await login(ctx, 'bob', BOB.email, BOB.password);
  },
};

export const authGuardScenario: Scenario = {
  id: 'auth-guard',
  title: 'Access-token guard: legacy tokens, token_version, deleted users',
  tasks: 'AUTH-02 (D19), AUTH-03',
  apis: 'A3, A5 (guard on every route)',
  journal: 'docs/journal/006, 007',
  summary:
    'Tokens signed like Python (no `type` claim) still pass during the cutover window; a bumped token_version or a soft-deleted user is rejected on the next request.',
  async run(ctx: DemoContext): Promise<void> {
    const { api } = ctx;
    const { alice } = await ensureUsers(ctx);
    const sign = (
      payload: object,
      secret = ctx.jwtSecret,
      expiresIn = 600,
    ): string => jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn });

    ctx.step(
      'Legacy Python access token, no `type` claim (D19)',
      'Accepted while JWT_ACCEPT_LEGACY_ACCESS=true, until it expires.',
    );
    const legacy = sign({ sub: alice.userId });
    ctx.note(`claims: ${JSON.stringify(claimsOf(legacy))}`);
    let res = await api.get('/users/me', {
      authorization: {
        label: 'Bearer <legacy token {sub, exp}>',
        value: `Bearer ${legacy}`,
      },
    });
    ctx.expect(res, 200);

    ctx.step('A refresh-type JWT on the access path');
    res = await api.get('/users/me', {
      authorization: {
        label: 'Bearer <JWT type=refresh>',
        value: `Bearer ${sign({ sub: alice.userId, type: 'refresh' })}`,
      },
    });
    ctx.expect(res, 401, 'wrong_token_type');

    ctx.step('A token signed with another secret');
    res = await api.get('/users/me', {
      authorization: {
        label: 'Bearer <signed with a wrong secret>',
        value: `Bearer ${sign({ sub: alice.userId, type: 'access' }, 'not-the-secret')}`,
      },
    });
    ctx.expect(res, 401, 'invalid_token');

    ctx.step('An expired token');
    res = await api.get('/users/me', {
      authorization: {
        label: 'Bearer <expired 1 min ago>',
        value: `Bearer ${sign({ sub: alice.userId, type: 'access', ver: 0 }, ctx.jwtSecret, -60)}`,
      },
    });
    ctx.expect(res, 401, 'invalid_token');

    ctx.step(
      'Bump users.token_version (AUTH-03)',
      'Done with SQL: no backend endpoint bumps token_version yet.',
      'The demo runs with AUTH_USER_STATE_CACHE_SECONDS=0; in production the guard cache is ≤ 30 s.',
    );
    await ctx.sql(
      'token_version 0 → 1',
      `UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING username, token_version`,
      [alice.userId],
    );
    res = await api.get('/users/me', { as: alice });
    ctx.expect(res, 401, 'token_revoked');
    const fresh = await login(ctx, 'alice', ALICE.email, ALICE.password);
    ctx.equal('new token claim ver', claimsOf(fresh.token)?.ver, 1);
    res = await api.get('/users/me', { as: fresh });
    ctx.expect(res, 200);
    ctx.state.alice = fresh;

    ctx.step(
      'Exchange a legacy Python refresh JWT once (D19)',
      'Allowed until JWT_LEGACY_REFRESH_UNTIL (cutover + 7 days); the demo sets it 7 days ahead.',
    );
    const legacyRefresh = sign(
      { sub: alice.userId, type: 'refresh', ver: 1 },
      ctx.jwtSecret,
      3600,
    );
    res = await api.post('/auth/refresh', {
      body: { refreshToken: legacyRefresh },
    });
    ctx.expect(res, 200);
    ctx.check(
      'got an opaque refresh token back',
      typeof res.data?.refreshToken === 'string' &&
        !String(res.data.refreshToken).startsWith('eyJ'),
    );
    res = await api.post('/auth/refresh', {
      body: { refreshToken: legacyRefresh },
    });
    ctx.expect(res, 401, 'refresh_token_reused');

    ctx.step(
      'Soft-delete a user (carol)',
      'Her live access token is refused, and she can no longer log in.',
    );
    res = await api.post('/auth/signup', {
      body: {
        username: 'carol',
        email: 'carol@example.com',
        password: 'correct-horse-battery-3',
      },
    });
    ctx.expect(res, 201);
    const carol = await login(
      ctx,
      'carol',
      'carol@example.com',
      'correct-horse-battery-3',
    );
    await ctx.sql(
      'soft delete',
      `UPDATE users SET deleted_at = now() WHERE id = $1 RETURNING username, deleted_at`,
      [carol.userId],
    );
    res = await api.get('/users/me', { as: carol });
    ctx.expect(res, 401, 'user_inactive');
    res = await api.post('/auth/login', {
      body: { email: 'carol@example.com', password: 'correct-horse-battery-3' },
    });
    ctx.expect(res, 401, 'invalid_credentials');
  },
};
