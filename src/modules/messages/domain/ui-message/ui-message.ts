import {
  isObject,
  type Json,
  type JsonObject,
  pyB64DecodeSucceeds,
  pyStr,
  pyStrip,
  pyTruthy,
} from './py-compat';
import {
  needsProjection,
  projectRichContent,
  projectRichItems,
  type RichCapabilities,
} from './rich-projection';
import { sanitizePublicRichMetadata } from './rich-sanitize';

/**
 * MSG-02 — Vercel AI SDK `UIMessage` projection of a persisted message, a port of
 * Python `get_conversation_messages_ai_sdk` (app/api/ai_sdk.py) and the helpers
 * of app/services/event_streaming/ai_sdk_projection.py it calls:
 *
 *   assistant: v1 = metadata.rich_items_version == 1
 *              file parts = visible images (computed BEFORE projection)
 *              project content + rich_items for the client's capabilities
 *              attach the image file parts
 *   every message: guarantee a leading text part + web source parts,
 *              scrub legacy/internal metadata keys.
 *
 * Golden tests compare this with the Python functions (journal 020).
 */

export interface UiMessagePart {
  readonly [key: string]: Json;
}

export interface UiMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly parts: JsonObject[];
  readonly metadata: JsonObject | null;
  readonly createdAt: string;
}

export interface UiMessageSource {
  readonly id: string;
  readonly sender: 'user' | 'assistant';
  readonly content: string;
  /** Raw `message_metadata` as stored. */
  readonly metadata: Json | null;
  readonly createdAt: string;
}

/** Client capability flags (query), already combined with the server kill switch. */
export type UiMessageCapabilities = RichCapabilities;

/**
 * `effective_answer_visuals` / `effective_source_figures`: a feature needs the
 * base rich contract and the server switch `inline_rich_response_enabled`.
 */
export function effectiveCapabilities(input: {
  inlineRichResponseV1: boolean;
  answerVisualsV1: boolean;
  sourceFiguresV1: boolean;
  serverEnabled: boolean;
}): UiMessageCapabilities {
  const rich = input.inlineRichResponseV1 && input.serverEnabled;
  return {
    rich,
    answerVisuals: input.answerVisualsV1 && rich && input.serverEnabled,
    sourceFigures: input.sourceFiguresV1 && rich && input.serverEnabled,
  };
}

const LEGACY_METADATA_KEYS = new Set([
  'images',
  'has_images',
  'images_count',
  'agentic_images_count',
  'live_widgets',
  'canvas_artifact',
  'pending_tool_calls',
]);
const DB_REDUNDANT_METADATA_KEYS = new Set([
  'conversation_id',
  'has_tool_calls',
  'context_messages',
]);
const RICH_KEYS = new Set([
  'rich_items',
  'rich_items_version',
  'rich_reference_warnings',
]);
/** `PROTECTED_IMAGE_URL_PREFIXES` (same-origin authenticated image routes). */
const PROTECTED_IMAGE_URL_PREFIXES = [
  '/chat-images/',
  '/api/chat-images/',
  '/web-images/',
  '/api/web-images/',
];

interface FilePart {
  readonly url: string;
  readonly mediaType: string;
}

/** `scrub_legacy_metadata`. */
export function scrubLegacyMetadata(metadata: JsonObject): JsonObject {
  const pub = sanitizePublicRichMetadata(metadata);
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(pub)) {
    if (LEGACY_METADATA_KEYS.has(key) || DB_REDUNDANT_METADATA_KEYS.has(key))
      continue;
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

function isV1RichItemsMessage(metadata: Json | null | undefined): boolean {
  // Python `== 1`, where True == 1 as well.
  const version = isObject(metadata) ? metadata['rich_items_version'] : null;
  return version === 1 || version === true;
}

function mimeFromDataUrl(value: string): string | null {
  const payload = pyStrip(value);
  if (!payload.startsWith('data:')) return null;
  const header = payload.split(',', 1)[0] ?? '';
  const mime = pyStrip(header.slice(5).split(';')[0] ?? '');
  return mime.includes('/') ? mime : null;
}

/** `_normalize_image_item_to_file_part` (legacy `metadata.images` entries). */
function legacyImageToFilePart(item: Json): FilePart | null {
  if (!isObject(item)) return null;
  const rawMime = [
    item['mime'],
    item['mimeType'],
    item['mediaType'],
    item['contentType'],
  ].find(pyTruthy);
  let mime = rawMime === undefined ? 'image/png' : pyStrip(pyStr(rawMime));
  const candidates = [
    item['url'],
    item['data'],
    item['base64'],
    item['image'],
    item['source'],
  ];
  for (const raw of candidates) {
    let candidate: Json | undefined = raw;
    if (isObject(candidate)) {
      candidate = [
        candidate['url'],
        candidate['data'],
        candidate['base64'],
      ].find(pyTruthy);
    }
    if (typeof candidate !== 'string') continue;
    const value = pyStrip(candidate);
    if (!value) continue;
    if (value.startsWith('data:')) {
      const detected = mimeFromDataUrl(value);
      if (detected) mime = detected;
      return { url: value, mediaType: mime };
    }
    if (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('blob:') ||
      PROTECTED_IMAGE_URL_PREFIXES.some((p) => value.startsWith(p))
    ) {
      return { url: value, mediaType: mime };
    }
    if (!pyB64DecodeSucceeds(value)) continue;
    return { url: `data:${mime};base64,${value}`, mediaType: mime };
  }
  return null;
}

function dedupe(parts: FilePart[]): FilePart[] {
  const seen = new Set<string>();
  return parts.filter((p) => {
    const key = `${p.url}\u0000${p.mediaType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** `_extract_image_file_parts_from_metadata`. */
function legacyImageParts(metadata: Json | null | undefined): FilePart[] {
  if (!isObject(metadata)) return [];
  const images = metadata['images'];
  if (!Array.isArray(images)) return [];
  return dedupe(
    images.map(legacyImageToFilePart).filter((p): p is FilePart => p !== null),
  );
}

/** `selected_image_file_parts_from_rich_items`. */
function selectedImageParts(metadata: Json | null | undefined): FilePart[] {
  if (!isObject(metadata)) return [];
  const items = metadata['rich_items'];
  if (!Array.isArray(items)) return [];
  const parts: FilePart[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const payload = pyTruthy(item['payload']) ? item['payload'] : {};
    let sources: JsonObject[];
    if (item['type'] === 'image') {
      sources = isObject(payload) ? [payload] : [];
    } else if (item['type'] === 'image_group') {
      const cells = isObject(payload) ? payload['items'] : undefined;
      sources = Array.isArray(cells) ? cells.filter(isObject) : [];
    } else {
      continue;
    }
    for (const source of sources) {
      const mimeRaw = source['mime_type'];
      const mime = pyTruthy(mimeRaw) ? pyStr(mimeRaw) : 'image/png';
      if (pyTruthy(source['url'])) {
        parts.push({ url: pyStr(source['url']), mediaType: mime });
      } else if (pyTruthy(source['data'])) {
        parts.push({
          url: `data:${mime};base64,${pyStr(source['data'])}`,
          mediaType: mime,
        });
      }
    }
  }
  return dedupe(parts);
}

/** `visible_image_file_parts`. */
function visibleImageParts(
  metadata: Json | null | undefined,
  isV1: boolean,
  rich: boolean,
): FilePart[] {
  if (isV1) return rich ? [] : selectedImageParts(metadata);
  return legacyImageParts(metadata);
}

/** `project_ai_sdk_message_for_capability` on the `metadata` key. */
function projectForCapability(
  content: string,
  metadata: JsonObject | null,
  caps: UiMessageCapabilities,
): { content: string; metadata: JsonObject | null } {
  const items = (
    Array.isArray(metadata?.['rich_items']) ? metadata['rich_items'] : []
  ).filter(isObject);
  if (!needsProjection(content, items, caps)) return { content, metadata };
  const projected = projectRichContent(content, items, caps);
  if (!metadata) return { content: projected, metadata };
  if (!caps.rich) {
    const kept: JsonObject = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (!RICH_KEYS.has(k)) kept[k] = v;
    }
    return { content: projected, metadata: kept };
  }
  const richItems = metadata['rich_items'];
  if (Array.isArray(richItems)) {
    return {
      content: projected,
      metadata: { ...metadata, rich_items: projectRichItems(richItems, caps) },
    };
  }
  return { content: projected, metadata };
}

/** `ensure_leading_text_part` (+ web source parts). */
function ensureLeadingTextPart(
  parts: JsonObject[],
  content: string,
  metadata: JsonObject | null,
): JsonObject[] {
  const out = [...parts];
  const hasText = out.some((p) => p['type'] === 'text');
  if (!hasText && pyStrip(content))
    out.unshift({ type: 'text', text: content });
  const sources = metadata?.['web_sources'];
  const seen = new Set(
    out
      .filter((p) => p['type'] === 'source-url')
      .map((p) => pyStr(p['sourceId'])),
  );
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!isObject(source) || !pyTruthy(source['url'])) continue;
    const url = source['url'];
    const sourceId = pyStr(
      pyTruthy(source['source_id']) ? source['source_id'] : url,
    );
    if (seen.has(sourceId)) continue;
    out.push({
      type: 'source-url',
      sourceId,
      url: pyStr(url),
      title: pyStr(pyTruthy(source['title']) ? source['title'] : url),
    });
    seen.add(sourceId);
  }
  return out;
}

/** One persisted message ⇒ one UIMessage, for the given client capabilities. */
export function toUiMessage(
  message: UiMessageSource,
  caps: UiMessageCapabilities,
): UiMessage {
  // MessageRead sanitizes metadata before anything else.
  const stored = isObject(message.metadata)
    ? sanitizePublicRichMetadata(message.metadata)
    : null;
  let content = message.content;
  let metadata = stored;
  let parts: JsonObject[] = [];

  if (message.sender === 'assistant') {
    const isV1 = isV1RichItemsMessage(stored);
    const fileParts = visibleImageParts(stored, isV1, caps.rich);
    ({ content, metadata } = projectForCapability(content, metadata, caps));
    if (fileParts.length > 0) {
      // `attach_image_parts_to_message`: no parts yet ⇒ start with the text.
      if (pyStrip(content)) parts.push({ type: 'text', text: content });
      const urls = new Set<string>();
      for (const fp of fileParts) {
        if (urls.has(fp.url)) continue;
        parts.push({ type: 'file', url: fp.url, mediaType: fp.mediaType });
        urls.add(fp.url);
      }
    }
  }

  parts = ensureLeadingTextPart(parts, content, metadata);
  return {
    id: message.id,
    role: message.sender,
    content,
    parts,
    metadata: metadata ? scrubLegacyMetadata(metadata) : null,
    createdAt: message.createdAt,
  };
}
