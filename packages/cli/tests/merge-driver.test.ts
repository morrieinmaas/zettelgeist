import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { mergeDriverCommand } from '../src/commands/merge-driver.js';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-merge-driver-cli-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('merge-driver tasks — CLI dispatch', () => {
  it('reads %O/%A/%B, writes resolution to %A, exits 0 envelope', async () => {
    const basePath = path.join(tmp, 'base.tmp');
    const oursPath = path.join(tmp, 'ours.tmp');
    const theirsPath = path.join(tmp, 'theirs.tmp');
    await fs.writeFile(basePath, '- [ ] a\n- [ ] b\n');
    await fs.writeFile(oursPath, '- [x] a\n- [ ] b\n');
    await fs.writeFile(theirsPath, '- [ ] a\n- [x] b\n');

    const env = await mergeDriverCommand({ kind: 'tasks', basePath, oursPath, theirsPath });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect(env.data.outputPath).toBe(oursPath);

    const merged = await fs.readFile(oursPath, 'utf8');
    expect(merged).toContain('- [x] a');
    expect(merged).toContain('- [x] b');
    expect(merged).not.toContain('<<<<<<<');
  });

  it('handles a missing base file (tasks.md added in both branches)', async () => {
    const oursPath = path.join(tmp, 'ours.tmp');
    const theirsPath = path.join(tmp, 'theirs.tmp');
    await fs.writeFile(oursPath, '- [ ] a-from-ours\n');
    await fs.writeFile(theirsPath, '- [ ] b-from-theirs\n');

    const env = await mergeDriverCommand({
      kind: 'tasks',
      basePath: path.join(tmp, 'does-not-exist.tmp'),
      oursPath,
      theirsPath,
    });
    expect(env.ok).toBe(true);
    const out = await fs.readFile(oursPath, 'utf8');
    expect(out).toContain('a-from-ours');
    expect(out).toContain('b-from-theirs');
  });
});

describe('merge-driver tasks — end-to-end git merge', () => {
  it('a real git merge with conflicting task ticks resolves without markers', async () => {
    const cliBin = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..', 'dist', 'bin.js',
    );
    let binAvailable = true;
    try { await fs.access(cliBin); } catch { binAvailable = false; }
    if (!binAvailable) {
      console.warn(`skipping merge-driver tasks e2e: ${cliBin} not built`);
      return;
    }

    await execFileP('git', ['init', '-q'], { cwd: tmp });
    await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
    await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });

    // Wire the driver via .git/config to point at the built dist/bin.js.
    await execFileP('git', [
      'config', 'merge.zettelgeist-tasks.driver',
      `node ${cliBin} merge-driver tasks %O %A %B`,
    ], { cwd: tmp });
    await execFileP('git', [
      'config', 'merge.zettelgeist-tasks.name', 'Zettelgeist tasks.md three-way merge',
    ], { cwd: tmp });
    await fs.writeFile(
      path.join(tmp, '.gitattributes'),
      'specs/*/tasks.md merge=zettelgeist-tasks\n',
    );

    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.2"\n');
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'specs', 'foo', 'tasks.md'),
      '- [ ] alpha\n- [ ] beta\n- [ ] gamma\n',
    );
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
    const baseSha = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: tmp })).stdout.trim();

    // ours: tick alpha
    await execFileP('git', ['checkout', '-qb', 'ours'], { cwd: tmp });
    await fs.writeFile(
      path.join(tmp, 'specs', 'foo', 'tasks.md'),
      '- [x] alpha\n- [ ] beta\n- [ ] gamma\n',
    );
    await execFileP('git', ['commit', '-qa', '-m', 'tick alpha'], { cwd: tmp });

    // theirs: tick beta (concurrent — without the driver these would conflict
    // on adjacent / overlapping lines)
    await execFileP('git', ['checkout', '-q', baseSha], { cwd: tmp });
    await execFileP('git', ['checkout', '-qb', 'theirs'], { cwd: tmp });
    await fs.writeFile(
      path.join(tmp, 'specs', 'foo', 'tasks.md'),
      '- [ ] alpha\n- [x] beta\n- [ ] gamma\n',
    );
    await execFileP('git', ['commit', '-qa', '-m', 'tick beta'], { cwd: tmp });

    await execFileP('git', ['merge', '--no-edit', 'ours'], { cwd: tmp });

    const merged = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(merged).not.toContain('<<<<<<<');
    expect(merged).toContain('- [x] alpha');
    expect(merged).toContain('- [x] beta');
    expect(merged).toContain('- [ ] gamma');
  }, 30000);

  it('both sides ticking the same task → checked, no duplicate, no markers', async () => {
    const cliBin = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..', 'dist', 'bin.js',
    );
    try { await fs.access(cliBin); } catch {
      console.warn('skipping: dist/bin.js not built');
      return;
    }

    await execFileP('git', ['init', '-q'], { cwd: tmp });
    await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
    await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
    await execFileP('git', [
      'config', 'merge.zettelgeist-tasks.driver',
      `node ${cliBin} merge-driver tasks %O %A %B`,
    ], { cwd: tmp });
    await fs.writeFile(
      path.join(tmp, '.gitattributes'),
      'specs/*/tasks.md merge=zettelgeist-tasks\n',
    );
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [ ] one\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
    const baseSha = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: tmp })).stdout.trim();

    await execFileP('git', ['checkout', '-qb', 'ours'], { cwd: tmp });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [x] one\n');
    await execFileP('git', ['commit', '-qa', '-m', 'ours tick'], { cwd: tmp });

    await execFileP('git', ['checkout', '-q', baseSha], { cwd: tmp });
    await execFileP('git', ['checkout', '-qb', 'theirs'], { cwd: tmp });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [x] one\n');
    await execFileP('git', ['commit', '-qa', '-m', 'theirs tick'], { cwd: tmp });

    await execFileP('git', ['merge', '--no-edit', 'ours'], { cwd: tmp });
    const merged = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(merged).not.toContain('<<<<<<<');
    expect(merged.match(/- \[x\] one/g)).toHaveLength(1);
  }, 30000);
});
