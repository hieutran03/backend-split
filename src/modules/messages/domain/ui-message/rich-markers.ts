import { pyStrip, pyStripChars } from './py-compat';

/**
 * Port of the rich-marker helpers of Python app/core/rich_response.py used by the
 * UIMessage projection: parse, strip, remove and expand `<!--rich:<id>-->` markers
 * outside fenced code, indented code and inline code spans.
 */

export const RICH_ITEM_ID_MAX_LENGTH = 128;
const MARKER_OPEN = '<!--rich:';
const ITEM_ID_PATTERN = /^[A-Za-z0-9_\-.:]+$/;
const markerRe = (): RegExp => /<!--rich:([A-Za-z0-9_\-.:]+)-->/g;
/** Tolerant form: also matches ids the strict grammar rejects (used to delete them). */
const anyMarkerRe = (): RegExp => /<!--rich:([^\n]*?)-->/g;

interface MarkerMatch {
  readonly start: number;
  readonly end: number;
  readonly id: string;
}

function* matchesOf(re: RegExp, line: string): Generator<MarkerMatch> {
  for (const m of line.matchAll(re)) {
    yield { start: m.index, end: m.index + m[0].length, id: m[1] ?? '' };
  }
}

/** `_inline_code_ranges`: backtick-run delimited spans; unmatched runs are text. */
function inlineCodeRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const run = /`+/g;
  let pos = 0;
  for (;;) {
    run.lastIndex = pos;
    const opener = run.exec(line);
    if (!opener) return ranges;
    const ticks = opener[0];
    const openerEnd = opener.index + ticks.length;
    const closerStart = line.indexOf(ticks, openerEnd);
    if (closerStart < 0) {
      pos = openerEnd;
      continue;
    }
    const closerEnd = closerStart + ticks.length;
    ranges.push([opener.index, closerEnd]);
    pos = closerEnd;
  }
}

function overlaps(
  start: number,
  end: number,
  ranges: Array<[number, number]>,
): boolean {
  return ranges.some(([rs, re]) => start < re && end > rs);
}

function isValidId(id: string): boolean {
  return id.length <= RICH_ITEM_ID_MAX_LENGTH && ITEM_ID_PATTERN.test(id);
}

/** `_iter_inline_rich_marker_matches`. */
function validMarkers(line: string): MarkerMatch[] {
  if (!line.includes(MARKER_OPEN)) return [];
  const code = inlineCodeRanges(line);
  return [...matchesOf(markerRe(), line)].filter(
    (m) => !overlaps(m.start, m.end, code) && isValidId(m.id),
  );
}

/** `_iter_malformed_rich_marker_matches`. */
function malformedMarkers(line: string): MarkerMatch[] {
  if (!line.includes(MARKER_OPEN)) return [];
  const code = inlineCodeRanges(line);
  return [...matchesOf(anyMarkerRe(), line)].filter(
    (m) => !overlaps(m.start, m.end, code) && !isValidId(m.id),
  );
}

/** `_strip_fenced_code_blocks`: one flag per line, true inside a fence (fence lines included). */
function fencedFlags(lines: string[]): boolean[] {
  let inside = false;
  let fenceChar: string | null = null;
  let fenceLen = 0;
  const flags: boolean[] = [];
  for (const raw of lines) {
    const stripped = raw.replace(/^ +/, '');
    const leading = raw.length - stripped.length;
    let isFence = false;
    let matchLen = 0;
    let matchChar: string | null = null;
    const head = stripped.slice(0, 3);
    if (leading <= 3 && (head === '```' || head === '~~~')) {
      matchChar = stripped[0]!;
      let i = 0;
      while (i < stripped.length && stripped[i] === matchChar) i += 1;
      matchLen = i;
      isFence = matchLen >= 3;
    }
    if (!inside) {
      if (isFence) {
        inside = true;
        fenceChar = matchChar;
        fenceLen = matchLen;
        flags.push(true);
        continue;
      }
      flags.push(false);
    } else {
      const closes =
        isFence &&
        matchChar === fenceChar &&
        matchLen >= fenceLen &&
        pyStrip(stripped.slice(matchLen)) === '';
      flags.push(true);
      if (closes) {
        inside = false;
        fenceChar = null;
        fenceLen = 0;
      }
    }
  }
  return flags;
}

function isIndentedCode(line: string): boolean {
  if (pyStrip(line) === '') return false;
  return line.startsWith('    ') || line.startsWith('\t');
}

function splitLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/** `parse_inline_rich_references`: ids in occurrence order (duplicates kept). */
export function parseInlineRichReferences(markdown: string): string[] {
  if (!markdown) return [];
  const lines = splitLines(markdown);
  const fenced = fencedFlags(lines);
  const refs: string[] = [];
  lines.forEach((line, i) => {
    if (fenced[i] || isIndentedCode(line)) return;
    refs.push(...validMarkers(line).map((m) => m.id));
  });
  return refs;
}

/** `strip_malformed_rich_markers`. */
export function stripMalformedRichMarkers(markdown: string): string {
  if (!markdown || !markdown.includes(MARKER_OPEN)) return markdown;
  const lines = splitLines(markdown);
  const fenced = fencedFlags(lines);
  let changed = false;
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (fenced[i] || isIndentedCode(line)) {
      out.push(line);
      return;
    }
    const found = malformedMarkers(line);
    if (found.length === 0) {
      out.push(line);
      return;
    }
    changed = true;
    let cursor = 0;
    let stripped = '';
    for (const m of found) {
      stripped += line.slice(cursor, m.start);
      cursor = m.end;
    }
    stripped += line.slice(cursor);
    if (pyStrip(stripped) !== '') out.push(stripped);
    else if (pyStrip(line) !== '')
      return; // the marker was the whole line
    else out.push(stripped);
  });
  return changed ? out.join('\n') : markdown;
}

/** `strip_inline_rich_markers`: removes every marker (malformed ones first). */
export function stripInlineRichMarkers(input: string): string {
  if (!input || !input.includes(MARKER_OPEN)) return input;
  const markdown = stripMalformedRichMarkers(input);
  if (!markdown.includes(MARKER_OPEN)) return markdown;
  const lines = splitLines(markdown);
  const fenced = fencedFlags(lines);
  let changed = false;
  const out = lines.map((line, i) => {
    if (fenced[i] || isIndentedCode(line)) return line;
    const found = validMarkers(line);
    if (found.length === 0) return line;
    changed = true;
    let cursor = 0;
    let text = '';
    for (const m of found) {
      text += line.slice(cursor, m.start);
      cursor = m.end;
    }
    return text + line.slice(cursor);
  });
  return changed ? out.join('\n') : markdown;
}

/** `remove_inline_rich_reference`: removes the markers of one id. */
export function removeInlineRichReference(
  markdown: string,
  itemId: string,
): string {
  if (!markdown || !itemId || !markdown.includes(MARKER_OPEN)) return markdown;
  const lines = splitLines(markdown);
  const fenced = fencedFlags(lines);
  let changed = false;
  const out = lines.map((line, i) => {
    if (fenced[i] || isIndentedCode(line)) return line;
    let cursor = 0;
    let text = '';
    for (const m of validMarkers(line)) {
      if (m.id !== itemId) continue;
      text += line.slice(cursor, m.start);
      cursor = m.end;
      changed = true;
    }
    return cursor ? text + line.slice(cursor) : line;
  });
  if (!changed) return markdown;
  return pyStripChars(out.join('\n').replace(/\n{3,}/g, '\n\n'), '\n');
}

/**
 * `expand_inline_rich_references`: the first marker of an id becomes its block
 * as its own paragraph; later markers of the same id are removed.
 */
export function expandInlineRichReferences(
  markdown: string,
  blocks: ReadonlyMap<string, string>,
): string {
  if (!markdown || blocks.size === 0 || !markdown.includes(MARKER_OPEN)) {
    return markdown;
  }
  const lines = splitLines(markdown);
  const fenced = fencedFlags(lines);
  const expanded = new Set<string>();
  let changed = false;
  const out = lines.map((line, i) => {
    if (fenced[i] || isIndentedCode(line)) return line;
    const found = validMarkers(line).filter((m) => blocks.has(m.id));
    if (found.length === 0) return line;
    changed = true;
    const pieces: string[] = [];
    let text = '';
    let cursor = 0;
    for (const m of found) {
      text += line.slice(cursor, m.start);
      cursor = m.end;
      if (expanded.has(m.id)) continue;
      expanded.add(m.id);
      if (pyStrip(text)) pieces.push(pyStrip(text));
      text = '';
      pieces.push(blocks.get(m.id)!);
    }
    text += line.slice(cursor);
    if (pyStrip(text)) pieces.push(pyStrip(text));
    return pieces.join('\n\n');
  });
  return changed ? out.join('\n') : markdown;
}
