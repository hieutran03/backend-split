/**
 * Small helpers reproducing the Python semantics the UIMessage projection relies
 * on (MSG-02 is a port of app/services/event_streaming/ai_sdk_projection.py).
 * Pure functions, no framework.
 */

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Python `str.isspace()` code points. Differs from JS `trim`: Python also strips
 * U+001C..U+001F and U+0085, and does not strip U+FEFF.
 */
const PY_WHITESPACE = new Set(
  [
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0,
    0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  ].map((code) => String.fromCharCode(code)),
);

/** Python `s.strip()` (no argument). */
export function pyStrip(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && PY_WHITESPACE.has(s[start]!)) start += 1;
  while (end > start && PY_WHITESPACE.has(s[end - 1]!)) end -= 1;
  return s.slice(start, end);
}

/** Python `s.strip(chars)` for a set of single characters. */
export function pyStripChars(s: string, chars: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start]!)) start += 1;
  while (end > start && chars.includes(s[end - 1]!)) end -= 1;
  return s.slice(start, end);
}

/** Python truthiness of a JSON value. */
export function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

/** Python `str(value)` for JSON scalars (what the projection ever stringifies). */
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return pyJsonDumps(value as Json);
}

/**
 * Python `json.dumps(value, ensure_ascii=False)` with the DEFAULT separators
 * (", " and ": "). Integers and floats cannot be told apart after JSON.parse, so
 * a float like 1.0 prints as 1 — acceptable for the redaction path it serves.
 */
export function pyJsonDumps(value: Json): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pyJsonDumps).join(', ')}]`;
  return `{${Object.entries(value)
    .map(([k, v]) => `${JSON.stringify(k)}: ${pyJsonDumps(v)}`)
    .join(', ')}}`;
}

/** `json.loads` that answers undefined instead of raising. */
export function tryJsonLoads(text: string): Json | undefined {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return undefined;
  }
}

const B64_ALPHABET = /[A-Za-z0-9+/]/;

/**
 * Whether Python `base64.b64decode(value, validate=False)` succeeds — a port of
 * CPython binascii.a2b_base64 in non-strict mode: characters outside the
 * alphabet are skipped, a complete pad ends the input, and a dangling quad
 * raises ("Incorrect padding" / "1 more than a multiple of 4").
 */
export function pyB64DecodeSucceeds(value: string): boolean {
  // A str with non-ASCII characters raises ValueError before decoding.
  if ([...value].some((ch) => ch.charCodeAt(0) > 0x7f)) return false;
  let quadPos = 0;
  let pads = 0;
  for (const ch of value) {
    if (ch === '=') {
      pads += 1;
      if (quadPos >= 2 && quadPos + pads >= 4) return true;
      continue;
    }
    if (!B64_ALPHABET.test(ch)) continue;
    pads = 0;
    quadPos = (quadPos + 1) % 4;
  }
  return quadPos === 0;
}

export function deepClone<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
