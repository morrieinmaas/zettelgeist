import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { syncCommand } from '../src/commands/sync.js';
import { installMergeDrivers } from '@zettelgeist/git-hook';

const execFileP = promisify(execFile);

let upstream: string;
let localA: string;
let localB: string;

async function setupTwoClones(): Promise<void> {
  upstream = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-upstream-'));
  // `-b main` makes `main` the default branch so the bare repo's HEAD
  // points to it. Without this, Ubuntu's git (which defaults to `master`)
  // would leave HEAD on an empty `master`, and `git clone` would check
  // out the empty branch — localB would then have no files. macOS git
  // typically has `init.defaultBranch=main` set via brew, masking this
  // in local runs.
  await execFileP('git', ['init', '--bare', '-q', '-b', 'main'], { cwd: upstream });

  localA = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-A-'));
  await execFileP('git', ['clone', '-q', upstream, localA], { cwd: os.tmpdir() });
  await execFileP('git', ['config', 'user.email', 'a@e'], { cwd: localA });
  await execFileP('git', ['config', 'user.name', 'A'], { cwd: localA });
  await execFileP('git', ['checkout', '-qb', 'main'], { cwd: localA });

  await fs.writeFile(path.join(localA, '.zettelgeist.yaml'), 'format_version: "0.2"\n');
  await fs.mkdir(path.join(localA, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(localA, 'specs', 'foo', 'requirements.md'), '# foo\n');

  // Install drivers BEFORE the first commit so .gitattributes ships via the
  // initial push. Otherwise installMergeDrivers leaves a dirty working tree
  // and the dirty-tree check refuses to sync.
  await installMergeDrivers(localA);

  await execFileP('git', ['add', '.'], { cwd: localA });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: localA });
  await execFileP('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: localA });

  localB = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-B-'));
  await execFileP('git', ['clone', '-q', upstream, localB], { cwd: os.tmpdir() });
  await execFileP('git', ['config', 'user.email', 'b@e'], { cwd: localB });
  await execFileP('git', ['config', 'user.name', 'B'], { cwd: localB });
  // Idempotent — .gitattributes already matches, so no working-tree change;
  // only .git/config + .git/hooks/post-merge are written.
  await installMergeDrivers(localB);
}

beforeEach(async () => {
  await setupTwoClones();
});

afterEach(async () => {
  for (const dir of [upstream, localA, localB]) {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('syncCommand — happy paths', () => {
  it('reports up-to-date when local matches upstream', async () => {
    const r = await syncCommand({ cwd: localA, check: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('up-to-date');
    expect(r.data.commitsBehind).toBe(0);
    expect(r.data.commitsAhead).toBe(0);
  });

  it('fast-forwards when local is purely behind upstream', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'tasks.md'), '- [ ] a\n');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'tasks'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('fast-forwarded');
    expect(r.data.commitsBehind).toBe(1);
    expect(r.data.commitsAhead).toBe(0);
    await fs.access(path.join(localB, 'specs', 'foo', 'tasks.md'));
  });

  it('rebases when local and upstream diverged on non-conflicting files', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'tasks.md'), '- [ ] from A\n');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'A: add tasks'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    await fs.mkdir(path.join(localB, 'specs', 'bar'), { recursive: true });
    await fs.writeFile(path.join(localB, 'specs', 'bar', 'requirements.md'), '# bar from B\n');
    await execFileP('git', ['add', '.'], { cwd: localB });
    await execFileP('git', ['commit', '-q', '-m', 'B: add bar'], { cwd: localB });

    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('rebased');
    expect(r.data.commitsBehind).toBe(1);
    expect(r.data.commitsAhead).toBe(1);
    await fs.access(path.join(localB, 'specs', 'foo', 'tasks.md'));
    await fs.access(path.join(localB, 'specs', 'bar', 'requirements.md'));
  });
});

describe('syncCommand — --check (read-only)', () => {
  it('reports needs-sync without mutating remote-tracking refs', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'tasks.md'), '- [ ] a\n');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'tasks'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    const head = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: localB })).stdout.trim();
    // origin/main BEFORE the check
    const remoteBefore =
      (await execFileP('git', ['rev-parse', 'origin/main'], { cwd: localB })).stdout.trim();

    const r = await syncCommand({ cwd: localB, check: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe('needs-sync');
    expect(r.data.commitsBehind).toBe(1);

    // HEAD must not have moved (read-only).
    const headAfter = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: localB })).stdout.trim();
    expect(headAfter).toBe(head);
    // origin/main must not have moved either (the spec/help promises
    // --check does NOT update remote-tracking refs).
    const remoteAfter =
      (await execFileP('git', ['rev-parse', 'origin/main'], { cwd: localB })).stdout.trim();
    expect(remoteAfter).toBe(remoteBefore);
    // The new tasks.md must not be on disk yet.
    await expect(fs.access(path.join(localB, 'specs', 'foo', 'tasks.md'))).rejects.toThrow();
  });

  it('reports up-to-date in --check when local equals upstream', async () => {
    const r = await syncCommand({ cwd: localA, check: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe('up-to-date');
      expect(r.data.commitsBehind).toBe(0);
    }
  });
});

describe('syncCommand — repo state edge cases', () => {
  it('returns not-a-repo (--check) for a non-git directory', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-notrepo-'));
    try {
      const r = await syncCommand({ cwd: plain, check: true });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.status).toBe('not-a-repo');
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });

  it('errors with a specific message for a non-git directory (real sync)', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-notrepo2-'));
    try {
      const r = await syncCommand({ cwd: plain, check: false });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/not a git repository/);
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });

  it('returns detached-head status when HEAD is detached', async () => {
    const sha = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: localB })).stdout.trim();
    await execFileP('git', ['checkout', '-q', sha], { cwd: localB }); // detached
    const r = await syncCommand({ cwd: localB, check: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe('detached-head');

    const r2 = await syncCommand({ cwd: localB, check: false });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.message).toMatch(/detached/);
  });

  it('reports no-upstream in --check when none configured', async () => {
    const orphan = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-orphan-'));
    await execFileP('git', ['init', '-q', '-b', 'main'], { cwd: orphan });
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

  it('refuses (non --check) when drivers are not installed', async () => {
    // Set up a fresh clone without installing drivers.
    const noDrivers = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-sync-nodrv-'));
    await execFileP('git', ['clone', '-q', upstream, noDrivers], { cwd: os.tmpdir() });
    await execFileP('git', ['config', 'user.email', 'n@e'], { cwd: noDrivers });
    await execFileP('git', ['config', 'user.name', 'N'], { cwd: noDrivers });
    try {
      const r = await syncCommand({ cwd: noDrivers, check: false });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.message).toMatch(/merge drivers are not installed/);
        expect(r.error.message).toMatch(/install-hook/);
      }
    } finally {
      await fs.rm(noDrivers, { recursive: true, force: true });
    }
  });
});

describe('syncCommand — dirty working tree', () => {
  it('refuses to sync with a dirty working tree by default', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'extra.md'), '...');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'extra'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    await fs.writeFile(path.join(localB, 'untracked.md'), 'WIP');
    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/uncommitted/);
  });

  it('honors rebase.autoStash when set', async () => {
    await fs.writeFile(path.join(localA, 'specs', 'foo', 'extra.md'), '...');
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'extra'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    // Local B sets autoStash, has a dirty tree.
    await execFileP('git', ['config', 'rebase.autoStash', 'true'], { cwd: localB });
    await fs.writeFile(path.join(localB, 'tracked-but-dirty.md'), 'WIP');
    await execFileP('git', ['add', '.'], { cwd: localB });
    await execFileP('git', ['commit', '-q', '-m', 'wip'], { cwd: localB });
    // Now make a tracked change WITHOUT committing — that's the dirty case.
    await fs.writeFile(path.join(localB, 'tracked-but-dirty.md'), 'modified WIP');

    const r = await syncCommand({ cwd: localB, check: false });
    // autoStash lets git handle it; sync should not refuse.
    expect(r.ok).toBe(true);
  });
});

describe('syncCommand — rebase conflicts (NOT resolvable by drivers)', () => {
  it('leaves the rebase in progress and surfaces conflicted file list', async () => {
    // Both branches modify the SAME LINE of requirements.md BODY — that's
    // the case the frontmatter driver currently cannot auto-resolve (body
    // text divergence with no common ancestor change).
    await fs.writeFile(
      path.join(localA, 'specs', 'foo', 'requirements.md'),
      '# foo\n\nLine from A.\n',
    );
    await execFileP('git', ['add', '.'], { cwd: localA });
    await execFileP('git', ['commit', '-q', '-m', 'A body'], { cwd: localA });
    await execFileP('git', ['push', '-q'], { cwd: localA });

    await fs.writeFile(
      path.join(localB, 'specs', 'foo', 'requirements.md'),
      '# foo\n\nLine from B.\n',
    );
    await execFileP('git', ['add', '.'], { cwd: localB });
    await execFileP('git', ['commit', '-q', '-m', 'B body'], { cwd: localB });

    const r = await syncCommand({ cwd: localB, check: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/rebase --continue|rebase is still in progress/);
    expect(r.error.message).toMatch(/specs\/foo\/requirements\.md/);
    // Critically: the rebase should still be active so the user can fix +
    // continue. Verify with `.git/rebase-merge` (interactive) or `.git/
    // rebase-apply` (am-style). One of the two exists during a paused rebase.
    const rebaseMerge = path
      .join(localB, '.git', 'rebase-merge');
    const rebaseApply = path.join(localB, '.git', 'rebase-apply');
    const inRebase =
      (await fs.access(rebaseMerge).then(() => true).catch(() => false)) ||
      (await fs.access(rebaseApply).then(() => true).catch(() => false));
    expect(inRebase).toBe(true);
    // Clean up so afterEach can remove the temp dir.
    await execFileP('git', ['rebase', '--abort'], { cwd: localB });
  });
});
