import {
  isObject,
  type Json,
  type JsonObject,
  pyJsonDumps,
  pyStrip,
  tryJsonLoads,
} from './py-compat';

/**
 * Port of `sanitize_public_image_fields` / `sanitize_public_rich_metadata`
 * (Python app/core/rich_response.py). Python applies it to every message it
 * reads (`MessageRead`), so private original-image URLs never leave the API:
 *  - keys `original_image_url` / `original_image_digests` are dropped;
 *  - any string equal (after strip) to a private URL is dropped from its object;
 *  - a private URL inside other text is replaced by a redaction note;
 *  - JSON serialized inside a string is sanitized too; a malformed string that
 *    mentions the private key fails closed (redacted).
 * Never mutates its input.
 */

const PRIVATE_KEY = 'original_image_url';
const OMIT_KEYS = new Set(['original_image_url', 'original_image_digests']);
const REDACTION = '[private image metadata redacted]';

function collectPrivateUrls(value: Json | undefined, out: Set<string>): void {
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === PRIVATE_KEY && typeof item === 'string' && pyStrip(item)) {
        out.add(pyStrip(item));
      }
      collectPrivateUrls(item, out);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPrivateUrls(item, out);
    return;
  }
  if (typeof value !== 'string' || !value.includes(PRIVATE_KEY)) return;
  const parsed = tryJsonLoads(value);
  if (isObject(parsed) || Array.isArray(parsed))
    collectPrivateUrls(parsed, out);
}

function sanitize(value: Json, privateUrls: ReadonlySet<string>): Json {
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (OMIT_KEYS.has(key)) continue;
      if (typeof item === 'string' && privateUrls.has(pyStrip(item))) continue;
      out[key] = sanitize(item, privateUrls);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, privateUrls));
  if (typeof value !== 'string') return value;
  if (value.includes(PRIVATE_KEY)) {
    const parsed = tryJsonLoads(value);
    if (isObject(parsed) || Array.isArray(parsed)) {
      return pyJsonDumps(sanitize(parsed, privateUrls));
    }
    return REDACTION;
  }
  let text = value;
  for (const url of privateUrls) {
    if (url && text.includes(url)) text = text.split(url).join(REDACTION);
  }
  return text;
}

export function sanitizePublicImageFields(value: Json): Json {
  const privateUrls = new Set<string>();
  collectPrivateUrls(value, privateUrls);
  return sanitize(value, privateUrls);
}

/** `sanitize_public_rich_metadata`. */
export function sanitizePublicRichMetadata(metadata: JsonObject): JsonObject {
  const sanitized = sanitizePublicImageFields(metadata) as JsonObject;
  const items = sanitized['rich_items'];
  if (Array.isArray(items)) {
    sanitized['rich_items'] = items.map((item) =>
      isObject(item) ? sanitizePublicImageFields(item) : item,
    );
  }
  return sanitized;
}
