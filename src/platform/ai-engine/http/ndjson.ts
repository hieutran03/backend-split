/**
 * Reads an NDJSON body line by line, WITHOUT waiting for the whole body (§11 "NDJSON reader").
 * Empty lines are skipped. Unparseable lines => throw (corrupt stream).
 */
export async function* readNdjson<T>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) yield JSON.parse(line) as T;
        newline = buffer.indexOf('\n');
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest.length > 0) yield JSON.parse(rest) as T;
  } finally {
    reader.releaseLock();
  }
}
