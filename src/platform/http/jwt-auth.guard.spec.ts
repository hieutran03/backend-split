import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError, UnauthorizedError } from '@shared/errors/app-error';
import type {
  UserTokenState,
  UserTokenStateReader,
} from '@platform/ports/user-token-state.port';
import { JwtTokenService } from '../auth/jwt-token.service';
import { type AppConfig } from '../config/app-config';
import {
  type AuthenticatedRequest,
  IS_ADMIN_ONLY,
  IS_PUBLIC,
} from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';

const jwt = new JwtTokenService({
  jwtSecret: 'test-secret',
  accessTtlSeconds: 900,
  acceptLegacyAccess: true,
});

class FakeStates implements UserTokenStateReader {
  public reads = 0;
  public constructor(private readonly states: Record<string, UserTokenState>) {}
  public read(userId: string): Promise<UserTokenState | null> {
    this.reads += 1;
    return Promise.resolve(this.states[userId] ?? null);
  }
  public invalidate(): void {}
}

function guardWith(
  states: Record<string, UserTokenState>,
  metadata: Record<string, boolean> = {},
  adminUserIds: string[] = [],
) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => metadata[key as string] ?? false);
  const config = { auth: { adminUserIds } } as unknown as AppConfig;
  const reader = new FakeStates(states);
  return { guard: new JwtAuthGuard(reflector, jwt, config, reader), reader };
}

function contextFor(authorization?: string) {
  const request = {
    headers: authorization ? { authorization } : {},
  } as AuthenticatedRequest;
  const context = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

async function reason(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UnauthorizedError);
  return (error as UnauthorizedError).reason;
}

const active = { tokenVersion: 0, active: true };

describe('JwtAuthGuard', () => {
  it('@Public route ⇒ allowed without a token and without reading user state', async () => {
    const { guard, reader } = guardWith({}, { [IS_PUBLIC]: true });
    await expect(guard.canActivate(contextFor().context)).resolves.toBe(true);
    expect(reader.reads).toBe(0);
  });

  it('missing bearer token ⇒ 401 missing_token', async () => {
    const { guard } = guardWith({});
    expect(await reason(guard.canActivate(contextFor().context))).toBe(
      'missing_token',
    );
  });

  it('valid token + active user + same version ⇒ allowed, actor attached', async () => {
    const { guard } = guardWith({ u1: active });
    const { context, request } = contextFor(
      `Bearer ${jwt.signAccess('u1', 0).token}`,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actor).toEqual({ userId: 'u1', isAdmin: false });
  });

  it('soft-deleted user ⇒ 401 user_inactive', async () => {
    const { guard } = guardWith({ u1: { tokenVersion: 0, active: false } });
    const { context } = contextFor(`Bearer ${jwt.signAccess('u1', 0).token}`);
    expect(await reason(guard.canActivate(context))).toBe('user_inactive');
  });

  it('unknown user (forged sub) ⇒ 401 user_inactive', async () => {
    const { guard } = guardWith({});
    const { context } = contextFor(
      `Bearer ${jwt.signAccess('ghost', 0).token}`,
    );
    expect(await reason(guard.canActivate(context))).toBe('user_inactive');
  });

  it('token_version bumped after the token was issued ⇒ 401 token_revoked', async () => {
    const { guard } = guardWith({ u1: { tokenVersion: 1, active: true } });
    const { context } = contextFor(`Bearer ${jwt.signAccess('u1', 0).token}`);
    expect(await reason(guard.canActivate(context))).toBe('token_revoked');
  });

  it('@AdminOnly with a normal user ⇒ 403; with an admin ⇒ allowed', async () => {
    const token = `Bearer ${jwt.signAccess('u1', 0).token}`;
    const user = guardWith({ u1: active }, { [IS_ADMIN_ONLY]: true });
    await expect(
      user.guard.canActivate(contextFor(token).context),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const admin = guardWith({ u1: active }, { [IS_ADMIN_ONLY]: true }, ['u1']);
    await expect(
      admin.guard.canActivate(contextFor(token).context),
    ).resolves.toBe(true);
  });
});
