import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { syncCommand } from '../src/commands/sync.js';

const execFileP = promisify(execFile);

let upstream: string;  // bare remote repo
let localA: string;    // clone A
let localB: string;    // clone B

async function setupTwoClones() {
  upstream = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-upstream-'));
  await execFileP('git', ['init', '--bare', '-q'], { cwd: upstream });

  localA = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-A-'));
  await execFileP('git', ['clone', '-q', upstream, localA], { cwd: os.tmpdir() });
  await execFileP('git', ['config', 'user.email', 'a@e'], { cwd: localA });
  await execFileP('git', ['config', 'user.name', 'A'], { cwd: localA });
  await execFileP('git', ['checkout', '-qb', 'main'], { cwd: localA });

  // Seed an initial commit on A.
  await fs.writeFile(path.join(localA, '.zettelgeist.yaml'), 'format_version: "0.2"\n');
  await fs.mkdir(path.join(localA, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(localA, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await execFileP('git', ['add', '.'], { cwd: localA });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: localA });
  await execFileP('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: localA });

  // Second clone.
  localB = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-B-'));
  await execFileP('git', ['clone', '-q', upstream, localB], { cwd: os.tmpdir() });
  await execFileP('git', ['config', 'user.email', 'b@e'], { cwd: localB });
  await execFileP('git', ['config', 'user.name', 'B'], { cwd: localB });
}

beforeEach(async () => {
  await setupTwoClones();
});

afterEach(async () => {
  for (const dir of [upstream, localA, localB]) {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('syncCommand', () => {
  it('reports up-to-date when local matches upstream', async () => {
    const r = await syncCommand({ cwd: localA, check: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('up-to-date');
    expect(r.data.pulledCommits).toBe(0);
  });

  it('reports no-upstream in --check mode when none is configured', async () => {
    // Make a repo without an upstream.
    const orphan = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-orphan-'));
    await execFileP('git', ['init', '-q'], { cwd: orphan });
    await execFileP('git', ['config', 'user.email', 'o@e'], { cwd: orphan });
    await execFileP('git', ['config', 'user.name', 'O'], { cwd: orphan });
    await fs.writeFile(path.join(orphan, 'README.md'), '# init\n');
    await execFileP('git', ['add', '.'], { cwd: orphan });
    await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: orphan });
    try {
      const r = await syncCommand({ cwd: orphan, check: true });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.status).toBe('no-upstream');
    } finally {
      await fs.rm(orphan, { recursive: true, force: true });
    }
  });

  it('errors (non --check) when no upstream is configured', async () => {
    const orphan = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-orphan2-'));
    await execFileP('git', ['init', '-q'], { cwd: orphan });
    await execFileP('git', ['config', 'user.email', 'o@e'], { cwd: orphan });
    await execFileP('git', ['config', 'user.name', 'O'], { cwd: orphan });
    await fs.writeFile(path.join(orphan, 'README.md'), '# init\n');
    await execFileP('git', ['add', '.'], { cwd: orphan });
    await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: orphan });
    try {
      const r = await syncCommand({ cwd: orphan, check: false });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/no upstream/);
    } finally {
      await fs.rm(orphan, { recursive: true, force: true });
    }
  });

  it('fast-forwards when local is purely behind upstream', async () => {
    // A pushes a second commit.
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'tasks.md'), '- [ ] a\n');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'tasks'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    // B is now behind by 1.
    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('fast-forwarded');
    expect(r.data.pulledCommits).toBe(1);
    // Tasks file should now exist locally.
    await fs.access(path.join(localB, 'specs', 'foo', 'tasks.md'));
  });

  it('--check reports needs-sync without mutating the working tree', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'tasks.md'), '- [ ] a\n');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'tasks'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    const head = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: localB })).stdout.trim();
    const r = await syncCommand({ cwd: localB, check: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('needs-sync');
    expect(r.data.pulledCommits).toBe(1);
    // HEAD must not have moved (read-only check).
    const headAfter = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: localB })).stdout.trim();
    expect(headAfter).toBe(head);
    // No tasks.md fetched.
    await expect(fs.access(path.join(localB, 'specs', 'foo', 'tasks.md'))).rejects.toThrow();
  });

  it('rebases when local and upstream diverged on non-conflicting files', async () => {
    // A: push a commit touching one file.
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'tasks.md'), '- [ ] from A\n');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'A: add tasks'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    // B: commit a local change to a DIFFERENT file (so the rebase is clean).
    await fs.mkdir(path.join(localB, 'specs', 'bar'), { recursive: true });
    await fs.writeFile(path.join(localB, 'specs', 'bar', 'requirements.md'), '# bar from B\n');
    await execFileP('git', ['add', '.'], { cwd: localB });
    await execFileP('git', ['commit', '-q', '-m', 'B: add bar'], { cwd: localB });

    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('rebased');
    expect(r.data.pulledCommits).toBe(1);
    expect(r.data.replayedCommits).toBe(1);
    // Both changes present.
    await fs.access(path.join(localB, 'specs', 'foo', 'tasks.md'));
    await fs.access(path.join(localB, 'specs', 'bar', 'requirements.md'));
  });

  it('refuses to sync with a dirty working tree', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'extra.md'), '...');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'extra'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    await fs.writeFile(path.join(localB, 'untracked.md'), 'WIP');
    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/uncommitted/);
  });
});
