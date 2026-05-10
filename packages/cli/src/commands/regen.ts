import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

const execFileP = promisify(execFile);

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
  try {
    const { stdout } = await execFileP('git', ['rev-parse', `HEAD:${specsDir}`], { cwd: repoPath });
    return stdout.trim();
  } catch {
    // specs/ may not yet exist in HEAD; fall back to root tree SHA of HEAD.
    try {
      const { stdout } = await execFileP('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoPath });
      return stdout.trim();
    } catch {
      return null;
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
