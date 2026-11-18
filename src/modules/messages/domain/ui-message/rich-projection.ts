import { isObject, type Json, type JsonObject } from './py-compat';
import {
  expandInlineRichReferences,
  parseInlineRichReferences,
  removeInlineRichReference,
  stripInlineRichMarkers,
} from './rich-markers';
import { isSourceFigure, legacySourceFigure } from './source-figures';

/** Port of Python app/core/rich_projection.py (+ answer_visuals constants). */

export const ANSWER_VISUAL_TYPE = 'answer_visual';
export const ANSWER_VISUAL_ID_PREFIX = 'visual:';

export interface RichCapabilities {
  readonly rich: boolean;
  readonly answerVisuals: boolean;
  readonly sourceFigures: boolean;
}

export function isAnswerVisual(item: unknown): boolean {
  return isObject(item) && item['type'] === ANSWER_VISUAL_TYPE;
}

/** `_fallbacks`: stored fallback Markdown per matching item id (first id wins on order). */
function fallbacks(
  items: readonly Json[],
  predicate: (item: unknown) => boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of items) {
    if (!isObject(item) || !predicate(item)) continue;
    const payload = isObject(item['payload']) ? item['payload'] : {};
    const fallback = payload['fallback_markdown'];
    if (
      typeof item['id'] === 'string' &&
      typeof fallback === 'string' &&
      fallback
    ) {
      out.set(item['id'], fallback);
    }
  }
  return out;
}

function blocksFor(
  items: readonly Json[],
  caps: RichCapabilities,
): Map<string, string> {
  const blocks = new Map<string, string>();
  if (!(caps.rich && caps.answerVisuals)) {
    for (const [id, fb] of fallbacks(items, isAnswerVisual)) blocks.set(id, fb);
  }
  if (!(caps.rich && caps.sourceFigures)) {
    for (const [id, fb] of fallbacks(items, isSourceFigure)) {
      blocks.set(id, caps.rich ? `${fb}\n\n<!--rich:${id}-->` : fb);
    }
  }
  return blocks;
}

/** `needs_projection`. */
export function needsProjection(
  content: unknown,
  items: readonly Json[],
  caps: RichCapabilities,
): boolean {
  if (!caps.rich) return true;
  if (blocksFor(items, caps).size > 0) return true;
  return (
    !caps.answerVisuals &&
    typeof content === 'string' &&
    content.includes(`<!--rich:${ANSWER_VISUAL_ID_PREFIX}`)
  );
}

/** `project_rich_content`. */
export function projectRichContent(
  content: string,
  items: readonly Json[],
  caps: RichCapabilities,
): string {
  if (!content || !content.includes('<!--rich:')) return content;
  const blocks = blocksFor(items, caps);
  let projected = expandInlineRichReferences(content, blocks);
  if (!(caps.rich && caps.answerVisuals)) {
    for (const id of parseInlineRichReferences(projected)) {
      if (id.startsWith(ANSWER_VISUAL_ID_PREFIX) && !blocks.has(id)) {
        projected = removeInlineRichReference(projected, id);
      }
    }
  }
  if (!caps.rich) projected = stripInlineRichMarkers(projected);
  return projected;
}

/** `project_rich_items`. */
export function projectRichItems(
  items: readonly Json[],
  caps: Pick<RichCapabilities, 'answerVisuals' | 'sourceFigures'>,
): Json[] {
  const out: Json[] = [];
  for (const item of items) {
    if (isAnswerVisual(item) && !caps.answerVisuals) continue;
    if (isSourceFigure(item) && !caps.sourceFigures) {
      out.push(legacySourceFigure(item as JsonObject));
      continue;
    }
    out.push(item);
  }
  return out;
}
