import type { Task } from './types.js';
import { parseTasks } from './tasks.js';

/**
 * Three-way merge for a `tasks.md` body. Pure function: 3 strings in, one
 * merged string out plus a success flag.
 *
 * Tasks are matched by **text identity** (the cleaned task text after the
 * parser strips numbering and known tags). This is more robust than matching
 * by 1-indexed position, which silently mis-aligns when one side adds or
 * removes a task earlier in the file. The trade-off: renaming a task on one
 * side looks like "delete + add" to the merger, so both versions appear in
 * the output. That's a clearer signal to a human than conflict markers and
 * keeps the file mergeable.
 *
 * Per-task merge rules:
 *   - Either side checked → checked (commutative; ticks don't un-tick).
 *   - Both sides un-checked from a checked base → un-checked (both
 *     deliberately released).
 *   - Tags → union (e.g. one side adds `#agent-only`, the other adds
 *     `#human-only` → both kept).
 *   - Text differs → treated as separate tasks (see above); both kept.
 *
 * Structural rules:
 *   - The output is built from `ours` as the structural template (prose,
 *     headings, blank lines preserved). Each task line in `ours` is rewritten
 *     with the merged check state + tags.
 *   - Tasks present only in `theirs` are appended after the last line of
 *     `ours` (preceded by a blank line if needed).
 *   - Tasks present only in `base` (i.e. removed on `ours` AND `theirs`) are
 *     dropped.
 */
export function mergeTasksMd(
  base: string,
  ours: string,
  theirs: string,
): { content: string; ok: boolean } {
  const bByText = new Map<string, Task>();
  for (const t of parseTasks(base)) bByText.set(t.text, t);
  const oByText = new Map<string, Task>();
  for (const t of parseTasks(ours)) oByText.set(t.text, t);
  const tByText = new Map<string, Task>();
  for (const t of parseTasks(theirs)) tByText.set(t.text, t);

  const TASK_RE = /^([\s>]*)([-*+])\s+\[([ xX])\]\s+(.*)$/;
  const NUMERIC_PREFIX = /^\d+\.\s+/;
  const KNOWN_TAGS = new Set(['#human-only', '#agent-only', '#skip']);

  function rewriteLine(prefix: string, marker: string, rest: string): string {
    let text = rest.trim().replace(NUMERIC_PREFIX, '');
    const cleaned = text.split(/\s+/).filter((w) => !KNOWN_TAGS.has(w)).join(' ').trim();

    const o = oByText.get(cleaned);
    const t = tByText.get(cleaned);
    const b = bByText.get(cleaned);

    if (!o) {
      // Shouldn't normally happen — the line came from `ours` so we should
      // have parsed it. Defensive: emit it unchanged.
      return `${prefix}${marker} [${rest.startsWith('[') ? rest.charAt(1) : ' '}] ${rest}`;
    }

    let checked = o.checked;
    let tags = [...o.tags] as Task['tags'][number][];
    if (t) {
      seenTexts.add(cleaned);
      if (b && b.checked && !o.checked && !t.checked) {
        checked = false;
      } else {
        checked = o.checked || t.checked;
      }
      const tagSet = new Set<string>([...o.tags, ...t.tags]);
      tags = [...tagSet] as Task['tags'][number][];
    }

    const mark = checked ? 'x' : ' ';
    const tagSuffix = tags.length > 0 ? ' ' + tags.join(' ') : '';
    return `${prefix}${marker} [${mark}] ${cleaned}${tagSuffix}`;
  }

  const seenTexts = new Set<string>();
  const outputLines: string[] = [];
  for (const line of ours.split('\n')) {
    const m = line.match(TASK_RE);
    if (m) {
      const [, prefix, marker, , rest] = m;
      outputLines.push(rewriteLine(prefix ?? '', marker ?? '-', rest ?? ''));
    } else {
      outputLines.push(line);
    }
  }

  // Append tasks that exist in `theirs` but not `ours`.
  const newFromTheirs: Task[] = [];
  for (const t of tByText.values()) {
    if (seenTexts.has(t.text)) continue;
    if (oByText.has(t.text)) continue;
    newFromTheirs.push(t);
  }
  if (newFromTheirs.length > 0) {
    // Separate from the existing content with a blank line unless the file
    // already ends with one (or is empty).
    if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
      outputLines.push('');
    }
    for (const t of newFromTheirs) {
      const mark = t.checked ? 'x' : ' ';
      const tagSuffix = t.tags.length > 0 ? ' ' + t.tags.join(' ') : '';
      outputLines.push(`- [${mark}] ${t.text}${tagSuffix}`);
    }
  }

  return { content: outputLines.join('\n'), ok: true };
}
