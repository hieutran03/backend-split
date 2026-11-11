import { turnLockKey } from './pg-turn-lock';

/**
 * Vectors computed with the §11 formula in Python:
 *   int.from_bytes(hashlib.sha256(str(uuid).encode()).digest()[:8], 'big', signed=True)
 */
describe('turnLockKey (§11, shared with Python)', () => {
  it.each([
    ['00000000-0000-4000-8000-000000000001', '1289600646178507792'],
    ['6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d', '-5772693095708135263'],
  ])('%s ⇒ %s', (id, key) => {
    expect(turnLockKey(id)).toBe(key);
  });

  it('is case-insensitive like Python str(UUID)', () => {
    expect(turnLockKey('6F1C2B9E-3D4A-4F5B-8C7D-9E0F1A2B3C4D')).toBe(
      '-5772693095708135263',
    );
  });
});
