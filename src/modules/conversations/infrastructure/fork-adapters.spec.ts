import { Sha256ForkFingerprint } from './fork-adapters';

/**
 * Golden values computed with Python `fork_request_fingerprint`
 * (json.dumps sort_keys, separators=(",", ":"), ensure_ascii=False; str(UUID)).
 */
describe('Sha256ForkFingerprint (port of Python fork_request_fingerprint)', () => {
  const fp = new Sha256ForkFingerprint();
  const source = '0F8C3A52-6D1B-4E8F-9A2C-1B2C3D4E5F60';
  const message = 'a1b2c3d4-e5f6-4789-8abc-def012345678';

  it('title null', () => {
    expect(
      fp.of({ sourceConversationId: source, messageId: message, title: null }),
    ).toBe('74a675481730c70624a9ccbab9044ec9e44319eb6cf9b423b29ac3204302ca5b');
  });

  it('non-ASCII, quotes and control characters are serialized like Python', () => {
    expect(
      fp.of({
        sourceConversationId: source,
        messageId: message,
        title: `Nhánh thử "x"\n${String.fromCharCode(0x2028)}\t\u0001\u{1F600}`,
      }),
    ).toBe('370e856a794c5d188be9076f7b74760a79ab30708c327e9616fed83d77119818');
  });
});
