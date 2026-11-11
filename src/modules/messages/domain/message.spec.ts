import { senderFromCode, senderToCode } from './message';

describe('message sender (S4)', () => {
  it('maps the DB integer to the API string and back', () => {
    expect(senderFromCode(1)).toBe('user');
    expect(senderFromCode(2)).toBe('assistant');
    expect(senderToCode('user')).toBe(1);
    expect(senderToCode('assistant')).toBe(2);
  });

  it('fails loudly on an unknown code instead of guessing', () => {
    expect(() => senderFromCode(3)).toThrow('Unknown messages.sender code: 3');
  });
});
