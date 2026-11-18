import { Conversation, defaultForkTitle } from './conversation';

describe('defaultForkTitle (Python default_fork_title)', () => {
  it('appends " (fork)"', () => {
    expect(defaultForkTitle('Plan')).toBe('Plan (fork)');
  });

  it('cuts the source to 248 code points and right-trims before the suffix', () => {
    const title = `${'a'.repeat(247)} ${'b'.repeat(10)}`;
    const result = defaultForkTitle(title);
    expect(result).toBe(`${'a'.repeat(247)} (fork)`);
    expect(result).toHaveLength(254);
  });

  it('counts code points, not UTF-16 units', () => {
    const result = defaultForkTitle('\u{1F600}'.repeat(300));
    expect(Array.from(result)).toHaveLength(255);
  });

  it('a 255-emoji title is valid (length in code points)', () => {
    const c = Conversation.start({
      id: 'c',
      ownerId: 'u',
      title: '\u{1F600}'.repeat(255),
      now: new Date(0),
    });
    expect(Array.from(c.snapshot().title)).toHaveLength(255);
  });
});
