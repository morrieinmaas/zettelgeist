/**
 * End-to-end pre-commit hook tests.
 *
 * Spins up real git repos, installs the hook via the same code path
 * users run (`installPreCommitHook`), and drives `git commit` through
 * every state the hook is supposed to handle. These tests exist to
 * regression-guard the two real bugs that hit users on `sensor-sender`:
 *
 *   1. A stale install in a non-zg repo blocked every commit with
 *      `error: not a zettelgeist repo`.
 *   2. A back-in-time checkout where `specs/INDEX.md` was not yet part
 *      of branch history blocked commits with `specs/INDEX.md is
 *      missing`, because the hook ran `regen --check` unconditionally.
 *
 * The hook's "should I run the check at all?" pre-flight is pure shell;
 * the `regen --check` invocation behind it is the CLI's job and is
 * unit-tested elsewhere. We stub the CLI here so we can observe whether
 * the pre-flight reached it (skip cases must NOT reach the stub; the
 * pass-through case MUST).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { installPreCommitHook } from '../src/install-hook.js';

const execFileP = promisify(execFile);

async function setupRepo(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-hook-e2e-'));
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  // Deterministic identity so commits don't bail on missing config.
  await execFileP('git', ['config', 'user.email', 'test@e2e.local'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'E2E'], { cwd: tmp });
  // Some CIs default to no initial branch; pin one for repeatability.
  await execFileP('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: tmp });
  return tmp;
}

/**
 * Write a `zettelgeist` stub into a sandbox `bin/` dir so we can:
 *   (a) detect whether the hook's pre-flight skipped it (file present
 *       but stub-was-called marker absent), and
 *   (b) force a deterministic pass/fail when the pre-flight does invoke
 *       it.
 *
 * Returns the bin dir; prepend it to PATH when running commits to
 * make the stub the resolution target of `command -v zettelgeist`.
 */
async function installZettelgeistStub(
  repo: string,
  opts: { exitCode: number; marker?: string },
): Promise<string> {
  const binDir = path.join(repo, '.test-bin');
  await fs.mkdir(binDir, { recursive: true });
  const stubPath = path.join(binDir, 'zettelgeist');
  const markerPath = path.join(repo, '.test-stub-was-called');
  // Touch the marker file so the test can assert the stub ran. Exit
  // with the requested code so we can drive both pass and fail paths.
  const body =
    '#!/bin/sh\n' +
    `touch "${markerPath}"\n` +
    `exit ${opts.exitCode}\n`;
  await fs.writeFile(stubPath, body);
  await fs.chmod(stubPath, 0o755);
  return binDir;
}

async function stubWasCalled(repo: string): Promise<boolean> {
  return fs
    .access(path.join(repo, '.test-stub-was-called'))
    .then(() => true)
    .catch(() => false);
}

interface CommitOpts {
  pathOverride?: string;
  expectFail?: boolean;
}

async function commitFile(
  repo: string,
  file: string,
  content: string,
  message: string,
  opts: CommitOpts = {},
): Promise<{ ok: boolean; stderr: string }> {
  const abs = path.join(repo, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
  await execFileP('git', ['add', file], { cwd: repo });
  const env = opts.pathOverride
    ? { ...process.env, PATH: opts.pathOverride }
    : process.env;
  try {
    await execFileP('git', ['commit', '-q', '-m', message], { cwd: repo, env });
    return { ok: true, stderr: '' };
  } catch (err) {
    const e = err as { stderr?: string };
    return { ok: false, stderr: e.stderr ?? '' };
  }
}

describe('pre-commit hook end-to-end', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await setupRepo();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------
  // Pre-flight guard 1: non-zg repo (no .zettelgeist.yaml)
  // ------------------------------------------------------------------

  it('non-zg repo: hook does not block commits and never invokes zettelgeist', async () => {
    // Reproduces the original Sander bug: a stale hook install in a
    // repo that has no `.zettelgeist.yaml` was blocking every commit.
    await installPreCommitHook(tmp);
    const binDir = await installZettelgeistStub(tmp, { exitCode: 1 });

    const r = await commitFile(tmp, 'hello.txt', 'hello\n', 'first', {
      pathOverride: `${binDir}:/usr/bin:/bin`,
    });

    expect(r.ok).toBe(true);
    expect(await stubWasCalled(tmp)).toBe(false);
  });

  // ------------------------------------------------------------------
  // Pre-flight guard 2: zg repo, but specs/INDEX.md not tracked on this
  // branch (back-in-time checkout or fresh init pre-regen).
  // ------------------------------------------------------------------

  it('zg repo without tracked INDEX.md: hook does not block commits and never invokes zettelgeist', async () => {
    // Reproduces the apple-updates branch bug: a branch that predates
    // the first `regen` has `.zettelgeist.yaml` but no `specs/INDEX.md`
    // in its history. The hook used to fail with `specs/INDEX.md is
    // missing` and block every commit on that branch.
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
    await execFileP('git', ['add', '.zettelgeist.yaml'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'init zg config'], { cwd: tmp });

    await installPreCommitHook(tmp);
    const binDir = await installZettelgeistStub(tmp, { exitCode: 1 });

    const r = await commitFile(tmp, 'feature.txt', 'work\n', 'feature', {
      pathOverride: `${binDir}:/usr/bin:/bin`,
    });

    expect(r.ok).toBe(true);
    expect(await stubWasCalled(tmp)).toBe(false);
  });

  // ------------------------------------------------------------------
  // Hook reaches the binary when both guards pass.
  // ------------------------------------------------------------------

  it('zg repo with tracked INDEX.md: hook invokes zettelgeist regen --check', async () => {
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
    await fs.mkdir(path.join(tmp, 'specs'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'INDEX.md'), '# generated\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'init with INDEX'], { cwd: tmp });

    await installPreCommitHook(tmp);
    // Stub returns success → commit should pass; stub_was_called → true.
    const binDir = await installZettelgeistStub(tmp, { exitCode: 0 });

    const r = await commitFile(tmp, 'a.txt', 'a\n', 'add a', {
      pathOverride: `${binDir}:/usr/bin:/bin`,
    });

    expect(r.ok).toBe(true);
    expect(await stubWasCalled(tmp)).toBe(true);
  });

  it('zg repo with tracked INDEX.md but zettelgeist exits non-zero: commit is blocked', async () => {
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
    await fs.mkdir(path.join(tmp, 'specs'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'INDEX.md'), '# generated\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'init with INDEX'], { cwd: tmp });

    await installPreCommitHook(tmp);
    // Stub fails → commit must fail. This is the "INDEX is stale"
    // protection the hook exists for.
    const binDir = await installZettelgeistStub(tmp, { exitCode: 1 });

    const r = await commitFile(tmp, 'a.txt', 'a\n', 'add a', {
      pathOverride: `${binDir}:/usr/bin:/bin`,
    });

    expect(r.ok).toBe(false);
    expect(await stubWasCalled(tmp)).toBe(true);
  });

  // ------------------------------------------------------------------
  // Cross-branch scenario: the hook does the right thing when checking
  // out between a branch that has INDEX.md tracked and one that doesn't.
  // ------------------------------------------------------------------

  it('checking out a branch without tracked INDEX.md does not block commits there', async () => {
    // Set up: main has INDEX.md tracked. Then create a branch from a
    // commit that pre-dates INDEX.md and commit on it. This is the
    // exact `apple-updates` shape Sander hit.
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
    await fs.writeFile(path.join(tmp, 'README.md'), '# repo\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'pre-zg root'], { cwd: tmp });

    // Capture the pre-INDEX commit so we can branch from it later.
    const { stdout: rootSha } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: tmp });

    // Land INDEX.md on main.
    await fs.mkdir(path.join(tmp, 'specs'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'INDEX.md'), '# generated\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'add INDEX'], { cwd: tmp });

    // Install the hook AFTER both states exist so it lives across the
    // checkout (the realistic install order).
    await installPreCommitHook(tmp);
    const binDir = await installZettelgeistStub(tmp, { exitCode: 1 });

    // Branch off the pre-INDEX commit — `INDEX.md` is NOT in HEAD here.
    await execFileP('git', ['checkout', '-q', '-b', 'apple-updates', rootSha.trim()], {
      cwd: tmp,
    });

    const r = await commitFile(tmp, 'apple.txt', 'feature\n', 'apple feature', {
      pathOverride: `${binDir}:/usr/bin:/bin`,
    });

    expect(r.ok).toBe(true);
    expect(await stubWasCalled(tmp)).toBe(false);
  });
});
