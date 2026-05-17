import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  installMergeDrivers,
  mergeGitAttributes,
  mergePostMergeContent,
  GITATTRS_BLOCK,
  POST_MERGE_BLOCK,
} from '../src/install-merge-driver.js';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-merge-install-'));
  await execFileP('git', ['init', '-q'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('mergeGitAttributes', () => {
  it('writes the marker block to an empty file', () => {
    expect(mergeGitAttributes(null)).toBe(GITATTRS_BLOCK + '\n');
    expect(mergeGitAttributes('')).toBe(GITATTRS_BLOCK + '\n');
  });

  it('appends to existing content without our markers', () => {
    const existing = '*.bin binary\n';
    const result = mergeGitAttributes(existing);
    expect(result.startsWith(existing)).toBe(true);
    expect(result).toContain(GITATTRS_BLOCK);
  });

  it('replaces the marker region on re-install (idempotent)', () => {
    const initial = mergeGitAttributes(null);
    const reinstalled = mergeGitAttributes(initial);
    expect(reinstalled).toBe(initial);
  });

  it('preserves user content surrounding the marker region', () => {
    const existing =
      '# user header\n*.bin binary\n\n' +
      '# >>> zettelgeist >>>\nSTALE\n# <<< zettelgeist <<<\n\n' +
      '*.md text\n';
    const result = mergeGitAttributes(existing);
    expect(result).toContain('# user header');
    expect(result).toContain('*.bin binary');
    expect(result).toContain('*.md text');
    expect(result).toContain('specs/INDEX.md merge=union');
    expect(result).not.toContain('STALE');
  });
});

describe('mergePostMergeContent', () => {
  it('writes the marker block to an empty file', () => {
    expect(mergePostMergeContent(null)).toBe(POST_MERGE_BLOCK + '\n');
  });

  it('idempotent on re-install', () => {
    const initial = mergePostMergeContent(null);
    expect(mergePostMergeContent(initial)).toBe(initial);
  });

  it('rejects a non-empty non-marker hook (caller decides whether to back up)', () => {
    expect(() => mergePostMergeContent('#!/bin/sh\necho "user hook"\n')).toThrow(/non-marker content/i);
  });

  it('accepts a hook that is just a shebang (treats as empty)', () => {
    const result = mergePostMergeContent('#!/bin/sh\n');
    expect(result).toContain(POST_MERGE_BLOCK);
    expect(result.startsWith('#!/bin/sh\n')).toBe(true);
  });
});

describe('installMergeDrivers', () => {
  it('writes .gitattributes and post-merge hook on a fresh repo', async () => {
    await installMergeDrivers(tmp);
    const ga = await fs.readFile(path.join(tmp, '.gitattributes'), 'utf8');
    expect(ga).toContain('specs/INDEX.md merge=union');
    const hook = await fs.readFile(path.join(tmp, '.git', 'hooks', 'post-merge'), 'utf8');
    expect(hook).toContain('regen');
    const stat = await fs.stat(path.join(tmp, '.git', 'hooks', 'post-merge'));
    expect(stat.mode & 0o100).toBe(0o100); // executable
  });

  it('is idempotent on re-install', async () => {
    await installMergeDrivers(tmp);
    const first = await fs.readFile(path.join(tmp, '.gitattributes'), 'utf8');
    await installMergeDrivers(tmp);
    const second = await fs.readFile(path.join(tmp, '.gitattributes'), 'utf8');
    expect(second).toBe(first);
  });

  it('backs up a conflicting pre-existing post-merge hook', async () => {
    const hookPath = path.join(tmp, '.git', 'hooks', 'post-merge');
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(hookPath, '#!/bin/sh\necho "user-custom"\n');
    const result = await installMergeDrivers(tmp);
    expect(result.postMergeBackup).toBeDefined();
    if (!result.postMergeBackup) return;
    const backup = await fs.readFile(result.postMergeBackup, 'utf8');
    expect(backup).toContain('user-custom');
    const replaced = await fs.readFile(hookPath, 'utf8');
    expect(replaced).toContain(POST_MERGE_BLOCK);
  });

  it('strips stale merge.zettelgeist-index.* config from a prior driver-based install', async () => {
    await execFileP('git', [
      '-C', tmp, 'config', 'merge.zettelgeist-index.driver', 'old-driver %O %A %B',
    ]);
    await execFileP('git', [
      '-C', tmp, 'config', 'merge.zettelgeist-index.name', 'old name',
    ]);
    await installMergeDrivers(tmp);
    // git config exits non-zero when the key isn't found — confirms removal.
    await expect(
      execFileP('git', ['-C', tmp, 'config', '--get', 'merge.zettelgeist-index.driver']),
    ).rejects.toThrow();
  });
});

describe('end-to-end: post-merge hook regenerates INDEX after a real git merge', () => {
  it('produces a single follow-up commit with the correct INDEX', async () => {
    // Locate the published zettelgeist binary; skip if not built yet.
    const cliBin = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..', '..', 'cli', 'dist', 'bin.js',
    );
    let binAvailable = true;
    try { await fs.access(cliBin); } catch { binAvailable = false; }
    if (!binAvailable) {
      console.warn(`skipping post-merge e2e: ${cliBin} not built`);
      return;
    }

    // Build the repo
    await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
    await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.2"\n');
    await fs.mkdir(path.join(tmp, 'specs', 'alpha'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'alpha', 'requirements.md'), '# alpha\n');
    await fs.mkdir(path.join(tmp, 'specs', 'beta'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'beta', 'requirements.md'), '# beta\n');

    // Install our merge strategy + post-merge hook
    await installMergeDrivers(tmp);

    // The default hook looks for `zettelgeist` on PATH. Tests run before any
    // global install, so write a test-local hook that points at the built
    // dist/bin.js absolute path. Also note: NO pre-commit hook is installed
    // by this test (we're only exercising the post-merge path), so commits
    // don't need --no-verify.
    const hookPath = path.join(tmp, '.git', 'hooks', 'post-merge');
    await fs.writeFile(
      hookPath,
      '#!/bin/sh\n' +
      `node ${cliBin} regen >/dev/null\n` +
      'if ! git diff --quiet specs/INDEX.md 2>/dev/null; then\n' +
      '  git add specs/INDEX.md\n' +
      '  git commit -m "[zg] regen INDEX after merge" --no-verify >/dev/null\n' +
      'fi\n',
      'utf8',
    );
    await fs.chmod(hookPath, 0o755);

    // Initial commit
    const initialIndex =
      '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n\n## State\n\n(baseline)\n';
    await fs.writeFile(path.join(tmp, 'specs', 'INDEX.md'), initialIndex);
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
    const initialSha = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: tmp })).stdout.trim();

    // Branch ours: add gamma + write divergent INDEX
    await execFileP('git', ['checkout', '-qb', 'ours'], { cwd: tmp });
    await fs.mkdir(path.join(tmp, 'specs', 'gamma'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'gamma', 'requirements.md'), '# gamma\n');
    await fs.writeFile(
      path.join(tmp, 'specs', 'INDEX.md'),
      '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n\nOURS DIVERGED INDEX\n',
    );
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'ours'], { cwd: tmp });

    // Branch theirs (off the initial commit): add delta + divergent INDEX
    await execFileP('git', ['checkout', '-q', initialSha], { cwd: tmp });
    await execFileP('git', ['checkout', '-qb', 'theirs'], { cwd: tmp });
    await fs.mkdir(path.join(tmp, 'specs', 'delta'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'delta', 'requirements.md'), '# delta\n');
    await fs.writeFile(
      path.join(tmp, 'specs', 'INDEX.md'),
      '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n\nTHEIRS DIVERGED INDEX\n',
    );
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'theirs'], { cwd: tmp });

    // Merge — INDEX gets union-merged (junk content, no markers), then the
    // post-merge hook regenerates correctly.
    await execFileP('git', ['merge', '--no-edit', 'ours'], { cwd: tmp });

    // Final INDEX must contain all four specs and no DIVERGED text.
    const finalIndex = await fs.readFile(path.join(tmp, 'specs', 'INDEX.md'), 'utf8');
    expect(finalIndex).not.toContain('<<<<<<<');
    expect(finalIndex).not.toContain('OURS DIVERGED');
    expect(finalIndex).not.toContain('THEIRS DIVERGED');
    expect(finalIndex).toContain('| alpha |');
    expect(finalIndex).toContain('| beta |');
    expect(finalIndex).toContain('| gamma |');
    expect(finalIndex).toContain('| delta |');

    // Verify the follow-up commit exists.
    const { stdout: log } = await execFileP('git', ['log', '--oneline', '-1'], { cwd: tmp });
    expect(log).toContain('[zg] regen INDEX after merge');
  }, 30000);
});
