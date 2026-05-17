import yaml from 'js-yaml';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

/**
 * Three-way merge for a `requirements.md` file. The frontmatter block (YAML
 * between two `---` fences) is merged field-by-field; the body (everything
 * after the closing fence) is delegated to `git merge-file -p` for proper
 * line-level three-way merge.
 *
 * Per-field rules (per the frontmatter-merge-driver spec — see
 * `spec/zettelgeist-v0.1.md` §9.2):
 *
 * | Field                                            | Rule                                      |
 * | ------------------------------------------------ | ----------------------------------------- |
 * | `status`                                         | 3-way: unchanged side loses, differing change → conflict marker |
 * | `depends_on`, `replaces` (lists)                 | set union (preserves first occurrence)    |
 * | `blocked_by`, `part_of`, `merged_into` (scalars) | 3-way; an explicit clear (set to empty) is honored if the other side is unchanged from base; differing change → conflict |
 * | `auto_merge` (boolean)                           | 3-way (NOT raw OR — allows turn-off)      |
 * | Unknown scalar/list/object keys                  | 3-way with `deepEqual`; differing change → conflict marker      |
 *
 * On conflict, the offending field is emitted with `# <<<<<<<` /
 * `# =======` / `# >>>>>>>` comment lines so the file remains valid YAML
 * (the comments don't disturb the parser) but a human can resolve in their
 * editor. The body uses `git merge-file`'s standard conflict markers
 * (no comment prefix; they break YAML parsing if they leak into the
 * frontmatter, but the body is post-frontmatter so this is fine).
 *
 * Returns `ok: true` iff the merge produced no markers anywhere — used by
 * the CLI driver to decide the exit code (per git's merge-driver contract:
 * exit 0 = clean, non-zero = conflicted).
 */
export function mergeFrontmatter(
  base: string,
  ours: string,
  theirs: string,
): { content: string; ok: boolean } {
  const oursParts = splitFrontmatter(ours);
  const theirsParts = splitFrontmatter(theirs);
  const baseParts = splitFrontmatter(base);

  const fmResult = mergeFrontmatterObjects(baseParts.data, oursParts.data, theirsParts.data);
  const bodyResult = mergeBody(baseParts.body, oursParts.body, theirsParts.body);

  const ok = fmResult.ok && bodyResult.ok;

  if (!hadFrontmatter(ours) && !hadFrontmatter(theirs) && !hadFrontmatter(base)) {
    return { content: bodyResult.content, ok };
  }

  const fmBlock = renderFrontmatter(fmResult);
  const sep = bodyResult.content.startsWith('\n') ? '' : '\n';
  return { content: `${fmBlock}${sep}${bodyResult.content}`, ok };
}

interface Split {
  hadFrontmatter: boolean;
  data: Record<string, unknown>;
  body: string;
}

function splitFrontmatter(input: string): Split {
  if (input === '') return { hadFrontmatter: false, data: {}, body: '' };
  const parsed = parseFrontmatter(input);
  return {
    hadFrontmatter: input.trimStart().startsWith('---'),
    data: parsed.data,
    body: parsed.body,
  };
}

function hadFrontmatter(input: string): boolean {
  return input.trimStart().startsWith('---');
}

interface FieldConflict { key: string; ours: unknown; theirs: unknown; }
interface FmMergeResult {
  data: Record<string, unknown>;
  conflicts: FieldConflict[];
  ok: boolean;
}

const LIST_FIELDS = new Set(['depends_on', 'replaces']);
const SINGLE_STRING_FIELDS = new Set(['blocked_by', 'part_of', 'merged_into']);

function mergeFrontmatterObjects(
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
): FmMergeResult {
  const conflicts: FieldConflict[] = [];
  const result: Record<string, unknown> = {};

  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs),
  ]);

  for (const key of allKeys) {
    const o = ours[key];
    const t = theirs[key];
    const b = base[key];

    if (key === 'status') {
      const r = threeWayScalar(b, o, t);
      if (r.kind === 'absent') continue;
      if (r.kind === 'ok') { result[key] = r.value; continue; }
      conflicts.push({ key, ours: o, theirs: t });
      result[key] = o; // keep ours; marker emitted on render
      continue;
    }

    if (LIST_FIELDS.has(key)) {
      // Preserve non-string entries — they're spec-violating but dropping
      // them silently destroys data. Render emits whatever js-yaml can.
      const oList = toList(o);
      const tList = toList(t);
      const merged = unionPreserveFirstOrder(oList, tList);
      if (merged.length === 0) continue;
      result[key] = merged;
      continue;
    }

    if (SINGLE_STRING_FIELDS.has(key)) {
      // 3-way over the raw value; don't coerce non-strings to empty (data
      // loss). "Empty" means undefined or the literal empty string.
      //
      // ORDER MATTERS: base-equality MUST be checked before the "non-empty
      // wins over empty" shortcut. Otherwise clearing a scalar (e.g.,
      // unblocking a spec via `blocked_by: ""`) gets silently reverted when
      // the other side is unchanged from base — the non-empty unchanged-base
      // value would "win" against the explicit clear, dropping user intent.
      if (deepEqual(o, t)) {
        if (!isEmpty(o)) result[key] = o;
        continue;
      }
      if (b !== undefined) {
        const oUnchanged = deepEqual(o, b);
        const tUnchanged = deepEqual(t, b);
        if (oUnchanged && !tUnchanged) {
          if (!isEmpty(t)) result[key] = t;
          continue;
        }
        if (tUnchanged && !oUnchanged) {
          if (!isEmpty(o)) result[key] = o;
          continue;
        }
      }
      // Both sides converged to empty/absent: semantic agreement even
      // when the textual form differs (`undefined` vs `""`). Drop the
      // key with no conflict — both sides explicitly said "no value".
      if (isEmpty(o) && isEmpty(t)) continue;

      if (b !== undefined) {
        // We got here past the base-equality short-circuit, so neither
        // side is unchanged from base — both sides changed differently.
        // Per spec §9.3 that's a conflict, REGARDLESS of whether one of
        // the changes happens to be a clear. The "non-empty wins over
        // empty" shortcut below would silently drop one side's deliberate
        // change (clear or otherwise) — same data-loss bug class as the
        // earlier base-ordering issue, just one level deeper.
        conflicts.push({ key, ours: o, theirs: t });
        result[key] = o;
        continue;
      }

      // No base. One side adds a value to a previously-absent key while
      // the other doesn't (or both add different values).
      if (isEmpty(o)) { result[key] = t; continue; }
      if (isEmpty(t)) { result[key] = o; continue; }
      conflicts.push({ key, ours: o, theirs: t });
      result[key] = o;
      continue;
    }

    if (key === 'auto_merge') {
      // 3-way: unchanged side loses; both changed differently → conflict.
      // Pure OR would make `auto_merge: true` impossible to turn off once
      // committed to base; 3-way semantics restore symmetry.
      const oB = typeof o === 'boolean' ? o : undefined;
      const tB = typeof t === 'boolean' ? t : undefined;
      const bB = typeof b === 'boolean' ? b : undefined;
      if (oB === undefined && tB === undefined) continue;
      if (oB === undefined) { if (tB) result[key] = true; continue; }
      if (tB === undefined) { if (oB) result[key] = true; continue; }
      if (oB === tB) { if (oB) result[key] = true; continue; }
      if (bB !== undefined && oB === bB) { if (tB) result[key] = true; continue; }
      if (bB !== undefined && tB === bB) { if (oB) result[key] = true; continue; }
      conflicts.push({ key, ours: oB, theirs: tB });
      if (oB) result[key] = true;
      continue;
    }

    // Unknown key: opaque 3-way with deepEqual.
    if (o === undefined && t === undefined) continue;
    if (o === undefined) { result[key] = t; continue; }
    if (t === undefined) { result[key] = o; continue; }
    if (deepEqual(o, t)) { result[key] = o; continue; }
    if (b !== undefined && deepEqual(o, b)) { result[key] = t; continue; }
    if (b !== undefined && deepEqual(t, b)) { result[key] = o; continue; }
    conflicts.push({ key, ours: o, theirs: t });
    result[key] = o;
  }

  return { data: result, conflicts, ok: conflicts.length === 0 };
}

type ScalarMergeOutcome =
  | { kind: 'absent' }
  | { kind: 'ok'; value: unknown }
  | { kind: 'conflict' };

function threeWayScalar(b: unknown, o: unknown, t: unknown): ScalarMergeOutcome {
  if (o === undefined && t === undefined) return { kind: 'absent' };
  if (o === undefined) return { kind: 'ok', value: t };
  if (t === undefined) return { kind: 'ok', value: o };
  if (deepEqual(o, t)) return { kind: 'ok', value: o };
  if (b !== undefined && deepEqual(o, b)) return { kind: 'ok', value: t };
  if (b !== undefined && deepEqual(t, b)) return { kind: 'ok', value: o };
  return { kind: 'conflict' };
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === '';
}

function renderFrontmatter(r: FmMergeResult): string {
  const KNOWN_ORDER = [
    'status', 'blocked_by', 'depends_on', 'replaces',
    'part_of', 'merged_into', 'auto_merge',
  ];
  const knownPresent = KNOWN_ORDER.filter((k) => k in r.data);
  const unknown = Object.keys(r.data)
    .filter((k) => !KNOWN_ORDER.includes(k))
    .sort();
  const lines: string[] = ['---'];
  const conflictKeys = new Set(r.conflicts.map((c) => c.key));
  for (const key of [...knownPresent, ...unknown]) {
    if (conflictKeys.has(key)) {
      const c = r.conflicts.find((x) => x.key === key)!;
      lines.push(`# <<<<<<< ours: ${key}`);
      lines.push(emitYamlPair(key, c.ours));
      lines.push(`# =======`);
      lines.push(`# theirs: ${formatScalarSingleLine(c.theirs)}`);
      lines.push(`# >>>>>>> theirs`);
      continue;
    }
    lines.push(emitYamlPair(key, r.data[key]));
  }
  lines.push('---');
  return lines.join('\n');
}

function emitYamlPair(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    return `${key}: [${value.map((v) => formatScalarSingleLine(v)).join(', ')}]`;
  }
  if (value !== null && typeof value === 'object') {
    // Nested objects under unknown keys — emit as a flow mapping so the
    // file stays single-line per key and the parser can round-trip it.
    return `${key}: ${yaml.dump(value, { flowLevel: 0, lineWidth: -1 }).trimEnd()}`;
  }
  return `${key}: ${formatScalarSingleLine(value)}`;
}

/**
 * Always returns a single line — multiline strings are JSON-escaped so they
 * fit on one YAML line. This keeps conflict markers parseable as YAML and
 * prevents block-scalar styles from leaking newlines into our `# theirs:`
 * comment line (which would break out of the comment).
 */
function formatScalarSingleLine(v: unknown): string {
  if (v === null) return '~';
  if (typeof v === 'string') {
    // Quote when the string contains YAML special chars, control chars,
    // a newline, leading/trailing whitespace, or is empty.
    if (v === '' || /[:#"'\[\]{}>|@`*&!%]/.test(v) || /[\n\r\t]/.test(v) || /^\s|\s$/.test(v)) {
      return JSON.stringify(v);
    }
    return v;
  }
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  // Arrays / objects: serialise as flow style; -1 line-width disables
  // wrapping (no line breaks).
  return yaml.dump(v, { flowLevel: 0, lineWidth: -1 }).trimEnd();
}

function toList(v: unknown): unknown[] {
  if (!Array.isArray(v)) return [];
  return v.slice();
}

function unionPreserveFirstOrder(a: unknown[], b: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const x of [...a, ...b]) {
    // Identity by JSON serialisation — primitives compare by value, objects
    // by structure. Avoids `Set<unknown>` reference-equality which would
    // double-count `{a:1}` from two parses.
    const key = JSON.stringify(x);
    if (!seen.has(key)) {
      out.push(x);
      seen.add(key);
    }
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as Record<string, unknown>);
    const bk = Object.keys(b as Record<string, unknown>);
    if (ak.length !== bk.length) return false;
    return ak.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

interface BodyMergeResult { content: string; ok: boolean; }

function mergeBody(base: string, ours: string, theirs: string): BodyMergeResult {
  // Cheap exits first: byte-equal cases don't need to fork git.
  if (ours === theirs) return { content: ours, ok: true };
  if (ours === base) return { content: theirs, ok: true };
  if (theirs === base) return { content: ours, ok: true };

  // Real three-way merge via `git merge-file -p`. We write the three sides
  // to a tempdir because git merge-file requires file paths; sync exec
  // keeps the API synchronous to match the rest of the merge pipeline.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zg-mergebody-'));
  try {
    const oursPath = path.join(dir, 'ours');
    const basePath = path.join(dir, 'base');
    const theirsPath = path.join(dir, 'theirs');
    writeFileSync(oursPath, ours, 'utf8');
    writeFileSync(basePath, base, 'utf8');
    writeFileSync(theirsPath, theirs, 'utf8');
    try {
      const out = execFileSync(
        'git',
        [
          'merge-file', '-p',
          '-L', 'ours', '-L', 'base', '-L', 'theirs',
          oursPath, basePath, theirsPath,
        ],
        { encoding: 'utf8' },
      );
      return { content: out, ok: true };
    } catch (err) {
      // git merge-file returns the number of unresolved conflicts as exit
      // code; with `-p` the merged content (with `<<<<<<<`/`=======`/
      // `>>>>>>>` markers) is on stdout. Surface that as ok:false so the
      // driver can propagate to git as a conflicted file.
      const e = err as { stdout?: Buffer | string; status?: number };
      const stdout = typeof e.stdout === 'string'
        ? e.stdout
        : e.stdout instanceof Buffer
          ? e.stdout.toString('utf8')
          : '';
      if (typeof e.status === 'number' && e.status > 0 && stdout !== '') {
        return { content: stdout, ok: false };
      }
      // Real failure (git missing, IO error, etc.) — fall back to a
      // hand-rolled marker block. ok:false ensures the driver fails closed.
      const fallback =
        `<<<<<<< ours\n${ours.replace(/\n$/, '')}\n` +
        `=======\n${theirs.replace(/\n$/, '')}\n` +
        `>>>>>>> theirs\n`;
      return { content: fallback, ok: false };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
