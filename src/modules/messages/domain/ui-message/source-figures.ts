import {
  deepClone,
  isObject,
  type Json,
  type JsonObject,
  pyStr,
  pyTruthy,
} from './py-compat';

/**
 * The parts of Python app/core/source_figures.py the projection needs:
 * recognizing a composed source figure and turning it into the exact legacy
 * payload an older client reads.
 */

const SOURCE_FIGURE_SOURCE = 'source_figure';
/** Payload fields only a figure-capable client understands. */
const ENRICHED_PAYLOAD_KEYS = [
  'label',
  'caption_evidence',
  'fallback_markdown',
  'comparison_unavailable',
];
const ENRICHED_GROUP_KEYS = [...ENRICHED_PAYLOAD_KEYS, 'caption'];
const ENRICHED_CELL_KEYS = new Set(['label', 'alt_text']);

export function isSourceFigure(item: unknown): boolean {
  return isObject(item) && item['source'] === SOURCE_FIGURE_SOURCE;
}

function payloadOf(item: JsonObject): JsonObject {
  const payload = item['payload'];
  return isObject(payload) ? payload : {};
}

/**
 * `figure_group_as_image` as far as `legacy_source_figure` can observe it: the
 * fallback Markdown Python computes there is removed again by the legacy step,
 * so it is not rebuilt here.
 */
function figureGroupAsImage(item: JsonObject): JsonObject {
  const payload = payloadOf(item);
  const cells = Array.isArray(payload['items']) ? payload['items'] : [];
  const cell = isObject(cells[0]) ? cells[0] : {};
  const image = deepClone(item);
  image['type'] = 'image';
  const alt = [cell['alt_text'], item['alt_text']].find(pyTruthy);
  image['alt_text'] = alt === undefined ? 'Image' : pyStr(alt);
  const imagePayload: JsonObject = {};
  for (const [key, value] of Object.entries(cell)) {
    if (key !== 'alt_text') imagePayload[key] = deepClone(value);
  }
  for (const key of ['caption', 'caption_evidence', 'comparison_unavailable']) {
    if (key in payload) imagePayload[key] = deepClone(payload[key]!);
  }
  imagePayload['fallback_markdown'] = '';
  image['payload'] = imagePayload;
  return image;
}

/** `legacy_source_figure`. Never mutates `item`. */
export function legacySourceFigure(input: JsonObject): JsonObject {
  let item = input;
  const cells = payloadOf(item)['items'];
  if (
    item['type'] === 'image_group' &&
    Array.isArray(cells) &&
    cells.length < 2
  ) {
    item = figureGroupAsImage(item);
  }
  const legacy = deepClone(item);
  // Python `legacy.get("payload") or {}`: an empty payload is a detached dict,
  // so edits to it are not visible in the result.
  const attached = legacy['payload'];
  const payload: JsonObject =
    isObject(attached) && Object.keys(attached).length > 0 ? attached : {};
  if (legacy['type'] === 'image_group') {
    for (const key of ENRICHED_GROUP_KEYS) delete payload[key];
    const groupCells: Json[] = Array.isArray(payload['items'])
      ? payload['items']
      : [];
    payload['items'] = groupCells.filter(isObject).map((cell) => {
      const kept: JsonObject = {};
      for (const [key, value] of Object.entries(cell)) {
        if (!ENRICHED_CELL_KEYS.has(key)) kept[key] = value;
      }
      return kept;
    });
  } else {
    for (const key of ENRICHED_PAYLOAD_KEYS) delete payload[key];
  }
  return legacy;
}
