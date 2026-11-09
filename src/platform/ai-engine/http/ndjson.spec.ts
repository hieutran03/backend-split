import { readNdjson } from './ndjson';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe('readNdjson', () => {
  it('joins lines split across chunks, skips empty lines, reads a final line missing \\n', async () => {
    const out: unknown[] = [];
    for await (const item of readNdjson(
      streamOf(['{"a":1}\n{"b"', ':2}\n\n', '{"c":3}']),
    ))
      out.push(item);
    expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});
