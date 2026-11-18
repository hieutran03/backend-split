import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Json } from './py-compat';
import { effectiveCapabilities, toUiMessage } from './ui-message';

interface GoldenCase {
  readonly name: string;
  readonly flags: {
    inlineRichResponseV1: boolean;
    answerVisualsV1: boolean;
    sourceFiguresV1: boolean;
  };
  readonly input: {
    id: string;
    sender: 'user' | 'assistant';
    content: string;
    metadata: Json | null;
  };
  readonly expected: Record<string, Json>;
}

/**
 * Golden cases produced by the REAL Python projection
 * (scripts/golden/ui_message_golden.py, server switch inline_rich_response_enabled=True).
 */
const cases = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../test/fixtures/ui-message-golden.json'),
    'utf8',
  ),
) as GoldenCase[];

describe('toUiMessage — golden parity with Python ai_sdk_projection', () => {
  it('has golden cases', () => {
    expect(cases.length).toBeGreaterThan(50);
  });

  it.each(cases.map((c) => [`${c.name} ${JSON.stringify(c.flags)}`, c]))(
    '%s',
    (_label, c) => {
      const caps = effectiveCapabilities({ ...c.flags, serverEnabled: true });
      const { createdAt, ...actual } = toUiMessage(
        { ...c.input, createdAt: '2026-11-18T00:00:00.000Z' },
        caps,
      );
      expect(createdAt).toBe('2026-11-18T00:00:00.000Z');
      expect(actual).toEqual(c.expected);
    },
  );

  it('server switch off ⇒ no rich capability whatever the client asks', () => {
    expect(
      effectiveCapabilities({
        inlineRichResponseV1: true,
        answerVisualsV1: true,
        sourceFiguresV1: true,
        serverEnabled: false,
      }),
    ).toEqual({ rich: false, answerVisuals: false, sourceFigures: false });
  });
});
