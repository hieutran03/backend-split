import { RefreshToken } from './refresh-token';

const now = new Date('2026-11-09T00:00:00.000Z');

function issue(userAgent: string | null = null) {
  return RefreshToken.issue({
    id: 't1',
    userId: 'u1',
    tokenHash: 'hash',
    userAgent,
    now,
    ttlSeconds: 60,
  });
}

describe('RefreshToken', () => {
  it('expires exactly at createdAt + ttl', () => {
    const t = issue();
    expect(t.isExpired(new Date(now.getTime() + 59_999))).toBe(false);
    expect(t.isExpired(new Date(now.getTime() + 60_000))).toBe(true);
  });

  it('rotate() is single use', () => {
    const t = issue();
    t.rotate('t2', now);
    expect(t.isRevoked).toBe(true);
    expect(t.snapshot().replacedById).toBe('t2');
    expect(() => t.rotate('t3', now)).toThrow();
  });

  it('legacy exchange marker is born revoked and points at its successor', () => {
    const m = RefreshToken.legacyExchangeMarker({
      id: 'm1',
      userId: 'u1',
      tokenHash: 'legacy-hash',
      successorId: 't9',
      now,
    });
    expect(m.isRevoked).toBe(true);
    expect(m.snapshot().replacedById).toBe('t9');
  });

  it('truncates very long user agents to the column size', () => {
    expect(issue('x'.repeat(2000)).snapshot().userAgent).toHaveLength(512);
  });
});
