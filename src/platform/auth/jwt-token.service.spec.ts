import jwt from 'jsonwebtoken';

import { UnauthorizedError } from '@shared/errors/app-error';
import { JwtTokenService } from './jwt-token.service';

const secret = 'test-secret';
const service = (acceptLegacyAccess = true) =>
  new JwtTokenService({
    jwtSecret: secret,
    accessTtlSeconds: 900,
    acceptLegacyAccess,
  });

describe('JwtTokenService (Python token compatibility)', () => {
  it('signs and verifies a new access token', () => {
    const { token } = service().signAccess('u1', 3);
    expect(service().verifyAccess(token)).toEqual({
      userId: 'u1',
      tokenVersion: 3,
      legacy: false,
    });
  });

  it('accepts a legacy token without type when D19 is enabled', () => {
    const legacy = jwt.sign({ sub: 'u1' }, secret, {
      algorithm: 'HS256',
      expiresIn: 60,
    });
    expect(service(true).verifyAccess(legacy)).toMatchObject({
      userId: 'u1',
      legacy: true,
      tokenVersion: 0,
    });
    expect(() => service(false).verifyAccess(legacy)).toThrow(
      UnauthorizedError,
    );
  });

  it.each(['refresh', 'widget'])(
    'rejects type=%s on the access path',
    (type) => {
      const token = jwt.sign({ sub: 'u1', type }, secret, {
        algorithm: 'HS256',
        expiresIn: 60,
      });
      expect(() => service().verifyAccess(token)).toThrow(UnauthorizedError);
    },
  );

  it('rejects an invalid signature', () => {
    const token = jwt.sign({ sub: 'u1', type: 'access' }, 'other', {
      algorithm: 'HS256',
    });
    expect(() => service().verifyAccess(token)).toThrow(UnauthorizedError);
  });
});
