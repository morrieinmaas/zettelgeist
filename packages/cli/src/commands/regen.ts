import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist regen [--check] [--json]

  Regenerate <specs_dir>/INDEX.md from the spec content in the current repo.

  Flags:
    --check        Exit 1 if INDEX.md is stale or missing instead of writing.
    --json         Emit a machine-readable JSON envelope.

  Caches generated INDEX content keyed by the git tree SHA at
  .zettelgeist/regen-cache.json so repeat runs are fast.
`;

export interface RegenInput {
  path: string;
  check: boolean;
}

export interface RegenOk {
  changed: boolean;
  path: string;        // relative INDEX.md path
  cacheHit?: boolean;
}

interface CacheEntry {
  tree_sha: string;
  generated_index: string;
}

async function getSpecsTreeSha(repoPath: string, specsDir: string): Promise<string | null> {
  // We need the tree SHA of the WORKING tree (uncommitted changes count),
  // not HEAD — otherwise REST writes that haven't been committed yet make
  // the cache report "up to date" even though INDEX.md is now stale.
  // `git stash create` produces a tree without modifying state, but is
  // heavy. Simpler: stage the specs dir into a temporary index, then
  // write-tree on it. Implementation here uses `git add --intent-to-add`
  // semantics via `git write-tree` against a snapshot of the working tree:
  // 1) `git ls-files -mco --exclude-standard <specsDir>` to enumerate
  // 2) hash each file's working-tree content via `git hash-object`
  // That's expensive for large repos. The pragmatic compromise: hash the
  // file contents directly with our own walker.
  try {
    const hash = await hashWorkingTree(repoPath, specsDir);
    return hash;
  } catch {
    // Not a git repo or specs/ missing — caller will skip caching.
    return null;
  }
}

async function hashWorkingTree(repoPath: string, specsDir: string): Promise<string> {
  const root = path.join(repoPath, specsDir);
  const entries: Array<{ rel: string; sha: string }> = [];
  const { createHash } = await import('node:crypto');
  await walk(root, '');
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = createHash('sha1');
  for (const e of entries) h.update(`${e.rel}\0${e.sha}\n`);
  return h.digest('hex');

  async function walk(absDir: string, relDir: string): Promise<void> {
    let names: string[];
    try { names = await fs.readdir(absDir); }
    catch { return; }
    for (const name of names) {
      // Skip junk + the generated INDEX.md itself (otherwise writing it
      // changes the tree hash and we never get a cache hit on round-trips).
      // Skip claim files: legacy single .claim AND per-actor .claim-<slug>.
      // They're ephemeral tool state; rolling them into the tree SHA would
      // make every claim/release invalidate the regen cache.
      if (name === '.git' || name === 'node_modules') continue;
      if (name === '.claim' || name.startsWith('.claim-')) continue;
      if (relDir === '' && name === 'INDEX.md') continue;
      const abs = path.join(absDir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      let stat;
      try { stat = await fs.stat(abs); }
      catch { continue; }
      if (stat.isDirectory()) {
        await walk(abs, rel);
      } else if (stat.isFile()) {
        const content = await fs.readFile(abs);
        const sha = createHash('sha1').update(content).digest('hex');
        entries.push({ rel, sha });
      }
    }
  }
}

async function readCache(repoPath: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(path.join(repoPath, '.zettelgeist', 'regen-cache.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof parsed.tree_sha !== 'string' || typeof parsed.generated_index !== 'string') return null;
    return { tree_sha: parsed.tree_sha, generated_index: parsed.generated_index };
  } catch {
    return null;
  }
}

async function writeCache(repoPath: string, entry: CacheEntry): Promise<void> {
  const dir = path.join(repoPath, '.zettelgeist');
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, 'regen-cache.json.tmp');
  await fs.writeFile(tmp, JSON.stringify(entry, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, path.join(dir, 'regen-cache.json'));
}

export async function regenCommand(input: RegenInput): Promise<Envelope<RegenOk>> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }

  const cfg = await loadConfig(reader);
  const specsDir = cfg.config.specsDir;
  const indexAbsPath = path.join(input.path, specsDir, 'INDEX.md');
  const indexRelPath = path.posix.join(specsDir, 'INDEX.md');

  const treeSha = await getSpecsTreeSha(input.path, specsDir);
  let generated: string | null = null;
  let cacheHit = false;
  if (treeSha) {
    const cache = await readCache(input.path);
    if (cache && cache.tree_sha === treeSha) {
      generated = cache.generated_index;
      cacheHit = true;
    }
  }

  if (generated === null) {
    let result;
    try {
      result = await runConformance(reader);
    } catch (err) {
      return errorEnvelope(err instanceof Error ? err.message : String(err));
    }
    generated = result.index;
    if (treeSha) {
      await writeCache(input.path, { tree_sha: treeSha, generated_index: generated });
    }
  }

  let onDisk: string | null = null;
  try {
    onDisk = await fs.readFile(indexAbsPath, 'utf8');
  } catch {}

  if (onDisk === generated) {
    return okEnvelope({ changed: false, path: indexRelPath, cacheHit });
  }
  if (input.check) {
    return errorEnvelope(onDisk === null ? `${indexRelPath} is missing` : `${indexRelPath} is stale`);
  }

  await fs.mkdir(path.dirname(indexAbsPath), { recursive: true });
  const tmpPath = `${indexAbsPath}.tmp`;
  await fs.writeFile(tmpPath, generated, 'utf8');
  await fs.rename(tmpPath, indexAbsPath);

  return okEnvelope({ changed: true, path: indexRelPath, cacheHit });
}
