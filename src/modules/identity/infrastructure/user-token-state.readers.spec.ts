import { FixedClock } from '@test-support/fakes';
import type {
  UserTokenState,
  UserTokenStateReader,
} from '@platform/ports/user-token-state.port';
import { CachedUserTokenStateReader } from './user-token-state.readers';

class CountingReader implements UserTokenStateReader {
  public reads = 0;
  public states = new Map<string, UserTokenState>();
  public read(userId: string): Promise<UserTokenState | null> {
    this.reads += 1;
    return Promise.resolve(this.states.get(userId) ?? null);
  }
  public invalidate(): void {}
}

function setup(maxEntries = 10_000) {
  const inner = new CountingReader();
  const clock = new FixedClock();
  const cached = new CachedUserTokenStateReader(
    inner,
    clock,
    30_000,
    maxEntries,
  );
  inner.states.set('u1', { tokenVersion: 0, active: true });
  return { inner, clock, cached };
}

describe('CachedUserTokenStateReader', () => {
  it('serves repeated reads from cache within the TTL', async () => {
    const { inner, cached } = setup();
    await cached.read('u1');
    await cached.read('u1');
    expect(inner.reads).toBe(1);
  });

  it('a change in the DB becomes visible once the TTL (≤ 30 s) has passed', async () => {
    const { inner, clock, cached } = setup();
    await cached.read('u1');
    inner.states.set('u1', { tokenVersion: 1, active: true });

    clock.advance(29_999);
    await expect(cached.read('u1')).resolves.toEqual({
      tokenVersion: 0,
      active: true,
    });
    clock.advance(1);
    await expect(cached.read('u1')).resolves.toEqual({
      tokenVersion: 1,
      active: true,
    });
  });

  it('invalidate() forces the next read to hit the DB', async () => {
    const { inner, cached } = setup();
    await cached.read('u1');
    cached.invalidate('u1');
    await cached.read('u1');
    expect(inner.reads).toBe(2);
  });

  it('caches unknown users too, so a forged sub cannot hammer the DB', async () => {
    const { inner, cached } = setup();
    await expect(cached.read('ghost')).resolves.toBeNull();
    await cached.read('ghost');
    expect(inner.reads).toBe(1);
  });

  it('stays bounded: the oldest entry is evicted when full', async () => {
    const { inner, cached } = setup(2);
    await cached.read('a');
    await cached.read('b');
    await cached.read('c'); // evicts "a"
    await cached.read('b'); // still cached
    expect(inner.reads).toBe(3);
    await cached.read('a'); // must be re-read
    expect(inner.reads).toBe(4);
  });
});
