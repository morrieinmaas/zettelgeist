import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { regenCommand } from '../src/commands/regen.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-regen-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function gitInit(dir: string): Promise<void> {
  await execFileP('git', ['init', '-q'], { cwd: dir });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: dir });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: dir });
  await execFileP('git', ['add', '.'], { cwd: dir });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
}

describe('regenCommand', () => {
  it('writes INDEX.md when missing', async () => {
    const r = await regenCommand({ path: tmp, check: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.changed).toBe(true);
    const written = await fs.readFile(path.join(tmp, 'specs', 'INDEX.md'), 'utf8');
    expect(written).toContain('_No specs._');
  });

  it('returns no-change when INDEX.md already current', async () => {
    await regenCommand({ path: tmp, check: false });
    const r = await regenCommand({ path: tmp, check: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.changed).toBe(false);
  });

  it('--check ok when current', async () => {
    await regenCommand({ path: tmp, check: false });
    const r = await regenCommand({ path: tmp, check: true });
    expect(r.ok).toBe(true);
  });

  it('--check error when stale or missing', async () => {
    const r = await regenCommand({ path: tmp, check: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/stale|missing/i);
  });

  it('returns error for non-zettelgeist repo', async () => {
    await fs.unlink(path.join(tmp, '.zettelgeist.yaml'));
    const r = await regenCommand({ path: tmp, check: false });
    expect(r.ok).toBe(false);
  });

  it('creates specs/ and INDEX.md when no specs directory exists', async () => {
    const r = await regenCommand({ path: tmp, check: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.changed).toBe(true);

    const indexExists = await fs.access(path.join(tmp, 'specs', 'INDEX.md')).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);
    const content = await fs.readFile(path.join(tmp, 'specs', 'INDEX.md'), 'utf8');
    expect(content).toContain('_No specs._');
  });
});

describe('regenCommand cache', () => {
  it('writes a cache file after first regen in a git repo', async () => {
    await gitInit(tmp);
    await regenCommand({ path: tmp, check: false });
    const cacheRaw = await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8');
    const cache = JSON.parse(cacheRaw);
    expect(cache.tree_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(cache.generated_index).toContain('_No specs._');
  });

  it('reuses cache when tree SHA matches', async () => {
    await gitInit(tmp);
    await regenCommand({ path: tmp, check: false });
    const cacheBefore = await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8');
    const r = await regenCommand({ path: tmp, check: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.cacheHit).toBe(true);
    const cacheAfter = await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8');
    expect(cacheAfter).toBe(cacheBefore);
  });

  it('regenerates and updates cache when tree SHA changes', async () => {
    await gitInit(tmp);
    await regenCommand({ path: tmp, check: false });
    const cacheBefore = JSON.parse(
      await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8'),
    );
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'add foo'], { cwd: tmp });
    await regenCommand({ path: tmp, check: false });
    const cacheAfter = JSON.parse(
      await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8'),
    );
    expect(cacheAfter.tree_sha).not.toBe(cacheBefore.tree_sha);
    expect(cacheAfter.generated_index).toContain('| foo |');
  });

  it('works in a non-git directory (cache keyed on content hash, not git tree SHA)', async () => {
    const r = await regenCommand({ path: tmp, check: false });
    expect(r.ok).toBe(true);
    // Content-hashing works without git, so caching is still useful and the
    // cache file is written. Repeating the call should hit the cache.
    const r2 = await regenCommand({ path: tmp, check: false });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.data.cacheHit).toBe(true);
  });
});
