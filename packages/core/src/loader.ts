import type { Spec, SpecFrontmatter, Task } from './types.js';
import { parseFrontmatter } from './frontmatter.js';
import { parseTasks } from './tasks.js';

export interface FsReader {
  readDir(path: string): Promise<Array<{ name: string; isDir: boolean }>>;
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

const SPEC_NAME = /^[a-z0-9-]+$/;

/**
 * Sanitize a free-form `agent_id` into a filesystem-safe slug for use in
 * `.claim-<slug>` filenames. Keeps letters/digits/`-`/`_`/`.`; replaces
 * everything else with `-`; collapses runs of `-`; trims leading dots so
 * the file isn't doubly-hidden; falls back to `agent` if the input is
 * empty after sanitization.
 *
 * Exported so CLI and MCP can both produce identical filenames for the
 * same logical actor.
 */
export function sanitizeAgentId(raw: string | undefined): string {
  const s = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');
  return s || 'agent';
}

/**
 * Returns true if `dir` (recursively) contains at least one file whose name ends with `.md`.
 * Exported because validateRepo also needs this check to emit `E_EMPTY_SPEC`.
 */
export async function folderContainsMarkdown(fs: FsReader, dir: string): Promise<boolean> {
  const entries = await fs.readDir(dir);
  for (const e of entries) {
    if (e.isDir) {
      if (await folderContainsMarkdown(fs, `${dir}/${e.name}`)) return true;
    } else if (e.name.endsWith('.md')) {
      return true;
    }
  }
  return false;
}

/**
 * Walk every spec directory under `specsDir` and report the names of specs
 * that have at least one claim file present. Recognises both shapes:
 *
 * - `.claim`        — legacy single-actor (v0.1)
 * - `.claim-<id>`   — per-actor (v0.2; multiple files coexist per spec)
 *
 * Returns an empty set when `specsDir` does not exist. Skips entries whose
 * directory name fails `SPEC_NAME` (same regex used by the loader).
 *
 * Today this checks file presence only; stale-claim TTL is a v0.3 question.
 */
export async function scanClaimedSpecs(fs: FsReader, specsDir = 'specs'): Promise<Set<string>> {
  const out = new Set<string>();
  if (!(await fs.exists(specsDir))) return out;
  const entries = await fs.readDir(specsDir);
  for (const entry of entries) {
    if (!entry.isDir) continue;
    if (!SPEC_NAME.test(entry.name)) continue;
    const dir = `${specsDir}/${entry.name}`;
    const inner = await fs.readDir(dir);
    for (const f of inner) {
      if (f.isDir) continue;
      if (f.name === '.claim' || f.name.startsWith('.claim-')) {
        out.add(entry.name);
        break;
      }
    }
  }
  return out;
}

export async function loadAllSpecs(fs: FsReader, specsDir = 'specs'): Promise<Spec[]> {
  if (!(await fs.exists(specsDir))) return [];
  const entries = await fs.readDir(specsDir);
  const specs: Spec[] = [];
  for (const entry of entries) {
    if (!entry.isDir) continue;
    if (!SPEC_NAME.test(entry.name)) continue; // strict-name folders only; loose names skipped silently
    const dir = `${specsDir}/${entry.name}`;
    // Skip folders that contain no markdown — those produce E_EMPTY_SPEC at validation time
    // but are not loaded as specs (no node, no status entry, no graph contribution).
    if (!(await folderContainsMarkdown(fs, dir))) continue;
    const spec = await loadSpec(fs, entry.name, specsDir);
    specs.push(spec);
  }
  specs.sort((a, b) => a.name.localeCompare(b.name));
  return specs;
}

export async function loadSpec(fs: FsReader, name: string, specsDir = 'specs'): Promise<Spec> {
  const root = `${specsDir}/${name}`;

  const requirementsPath = `${root}/requirements.md`;
  const tasksPath = `${root}/tasks.md`;
  const handoffPath = `${root}/handoff.md`;
  const lensesDir = `${root}/lenses`;

  let frontmatter: SpecFrontmatter = {};
  let requirements: string | null = null;
  if (await fs.exists(requirementsPath)) {
    const raw = await fs.readFile(requirementsPath);
    const parsed = parseFrontmatter(raw);
    frontmatter = parsed.data as SpecFrontmatter;
    requirements = parsed.body;
  }

  let tasks: Task[] = [];
  if (await fs.exists(tasksPath)) {
    const raw = await fs.readFile(tasksPath);
    // tasks.md frontmatter (if any) is permitted but ignored for spec-level fields.
    const parsed = parseFrontmatter(raw);
    tasks = parseTasks(parsed.body);
  }

  let handoff: string | null = null;
  if (await fs.exists(handoffPath)) {
    handoff = await fs.readFile(handoffPath);
  }

  const lenses = new Map<string, string>();
  if (await fs.exists(lensesDir)) {
    const lensEntries = await fs.readDir(lensesDir);
    for (const e of lensEntries) {
      if (e.isDir) continue; // nested lenses ignored at load time; validation flags later
      if (!e.name.endsWith('.md')) continue;
      const key = e.name.replace(/\.md$/, '');
      lenses.set(key, await fs.readFile(`${lensesDir}/${e.name}`));
    }
  }

  return { name, frontmatter, requirements, tasks, handoff, lenses };
}
