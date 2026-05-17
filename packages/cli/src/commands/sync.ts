import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

const execFileP = promisify(execFile);

export const HELP = `zettelgeist sync [--check] [--allow-dirty] [--json]

  Bring the local branch up to date with its upstream, auto-resolving
  Zettelgeist-managed file conflicts via the merge drivers installed by
  \`zettelgeist install-hook\`. Sequence:

    1. Verify the merge drivers are installed (refuses if not — run
       \`zettelgeist install-hook\` first).
    2. \`git fetch\` the current branch's upstream.
    3. If already up to date, exit 0.
    4. If only behind, fast-forward.
    5. If diverged, \`git rebase\` onto upstream. The custom merge drivers
       (tasks, frontmatter) and \`merge=union\` on INDEX.md let the rebase
       auto-resolve format-managed files; the post-merge hook regenerates
       INDEX from the final tree.

  When the rebase hits a conflict the drivers cannot resolve (e.g.,
  divergent prose in requirements.md body), sync STOPS and leaves the
  working tree in git's standard "rebase in progress" state. Resolve
  with your editor and \`git rebase --continue\` (or \`git rebase --abort\`
  to bail).

  Flags:
    --check         Read-only. Exits non-zero if a sync is needed. Uses
                    \`git ls-remote\` to inspect the upstream WITHOUT
                    updating local remote-tracking refs — truly side-
                    effect-free on the local repo (still opens a network
                    connection to the remote).
    --allow-dirty   Skip the clean-working-tree check. Useful when
                    \`rebase.autoStash\` is configured (autoStash is also
                    auto-detected and honored).
    --json          Emit a machine-readable envelope on stdout.

  Sync envelope statuses (machine-readable via --json):

    up-to-date       local matches upstream; no action needed
    fast-forwarded   local was purely behind; advanced to upstream
    rebased          local diverged; rebased + drivers resolved cleanly
    needs-sync       (--check only) remote has commits not on local
    no-upstream      no upstream configured for current branch
    not-a-repo       cwd is not a git repository
    detached-head    HEAD is detached; check out a branch first

  Requires: an upstream branch configured (\`git push -u\` once).
`;

export interface SyncInput {
  cwd: string;
  check: boolean;
  allowDirty?: boolean;
}

export type SyncStatus =
  | 'up-to-date'
  | 'fast-forwarded'
  | 'rebased'
  | 'needs-sync'
  | 'no-upstream'
  | 'not-a-repo'
  | 'detached-head';

export interface SyncOk {
  status: SyncStatus;
  /** Commits on remote that are NOT on local (i.e., would be pulled). */
  commitsBehind: number;
  /** Commits on local that are NOT on remote (i.e., would be replayed). */
  commitsAhead: number;
  /** True when a regen post-sync produced and committed a new INDEX. */
  indexRegenerated: boolean;
  /** True if regen produced a change but the commit step failed. */
  indexCommitFailed?: boolean;
}

async function tryGit(
  args: string[],
  cwd: string,
): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string; code: number }> {
  try {
    const r = await execFileP('git', args, { cwd });
    return { ok: true, stdout: r.stdout };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; code?: number };
    return { ok: false, stderr: e.stderr ?? e.stdout ?? String(err), code: e.code ?? 1 };
  }
}

type RepoStateProbe =
  | { kind: 'ok'; branch: string; upstream: string }
  | { kind: 'not-a-repo' }
  | { kind: 'detached-head' }
  | { kind: 'no-upstream'; branch: string };

/**
 * Distinguish "not a git repo" / "detached HEAD" / "no upstream" / "OK" so
 * callers can produce accurate error messages instead of one confusing
 * fallback.
 */
async function probeRepoState(cwd: string): Promise<RepoStateProbe> {
  const inWorktree = await tryGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (!inWorktree.ok || inWorktree.stdout.trim() !== 'true') {
    return { kind: 'not-a-repo' };
  }
  const head = await tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
  if (!head.ok) {
    return { kind: 'detached-head' };
  }
  const branch = head.stdout.trim();
  const upstream = await tryGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    cwd,
  );
  if (!upstream.ok) {
    return { kind: 'no-upstream', branch };
  }
  return { kind: 'ok', branch, upstream: upstream.stdout.trim() };
}

/**
 * Verify the Zettelgeist merge drivers are installed in `.git/config`.
 * Without them a rebase will hit raw text conflicts on tasks.md /
 * requirements.md and the user will have a confusing time.
 */
async function driversInstalled(cwd: string): Promise<boolean> {
  const tasks = await tryGit(['config', '--get', 'merge.zettelgeist-tasks.driver'], cwd);
  const fm = await tryGit(['config', '--get', 'merge.zettelgeist-frontmatter.driver'], cwd);
  return tasks.ok && fm.ok;
}

/**
 * Inspect the upstream WITHOUT updating local remote-tracking refs. Uses
 * `git ls-remote` (read-only on the local repo; still opens a network
 * connection to the remote, which is unavoidable to detect drift).
 *
 * Returns null if the remote can't be reached or any required local op
 * (merge-base, rev-list) fails.
 */
async function aheadBehindReadOnly(
  cwd: string,
  upstreamRef: string,
): Promise<{ ahead: number; behind: number } | null> {
  const slash = upstreamRef.indexOf('/');
  if (slash < 0) return null;
  const remote = upstreamRef.slice(0, slash);
  const remoteBranch = upstreamRef.slice(slash + 1);

  const lsRemote = await tryGit(['ls-remote', '--heads', remote, remoteBranch], cwd);
  if (!lsRemote.ok) return null;
  const remoteSha = lsRemote.stdout.split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/i.test(remoteSha)) return null;

  const localShaR = await tryGit(['rev-parse', 'HEAD'], cwd);
  if (!localShaR.ok) return null;
  const local = localShaR.stdout.trim();
  if (local === remoteSha) return { ahead: 0, behind: 0 };

  // If we don't have the remote SHA locally yet (remote moved beyond what
  // we've fetched), merge-base will fail. Conservative answer: treat as
  // needs-sync with unknown counts (1, 1) — the user will see the warning.
  const mergeBase = await tryGit(['merge-base', local, remoteSha], cwd);
  if (!mergeBase.ok) {
    return { ahead: 0, behind: 1 };
  }
  const base = mergeBase.stdout.trim();
  const ahead = await tryGit(['rev-list', '--count', `${base}..${local}`], cwd);
  const behind = await tryGit(['rev-list', '--count', `${base}..${remoteSha}`], cwd);
  return {
    ahead: ahead.ok ? Number.parseInt(ahead.stdout.trim(), 10) || 0 : 0,
    behind: behind.ok ? Number.parseInt(behind.stdout.trim(), 10) || 0 : 0,
  };
}

export async function syncCommand(input: SyncInput): Promise<Envelope<SyncOk>> {
  const probe = await probeRepoState(input.cwd);
  if (probe.kind === 'not-a-repo') {
    if (input.check) {
      return okEnvelope({
        status: 'not-a-repo',
        commitsBehind: 0,
        commitsAhead: 0,
        indexRegenerated: false,
      });
    }
    return errorEnvelope('sync: not a git repository');
  }
  if (probe.kind === 'detached-head') {
    if (input.check) {
      return okEnvelope({
        status: 'detached-head',
        commitsBehind: 0,
        commitsAhead: 0,
        indexRegenerated: false,
      });
    }
    return errorEnvelope('sync: HEAD is detached; check out a branch first');
  }
  if (probe.kind === 'no-upstream') {
    if (input.check) {
      return okEnvelope({
        status: 'no-upstream',
        commitsBehind: 0,
        commitsAhead: 0,
        indexRegenerated: false,
      });
    }
    return errorEnvelope(
      `sync: no upstream configured for branch '${probe.branch}'. ` +
        `Run \`git push -u origin ${probe.branch}\` once to set one.`,
    );
  }

  // --check is truly read-only: ls-remote only, no fetch, no rebase.
  if (input.check) {
    const counts = await aheadBehindReadOnly(input.cwd, probe.upstream);
    if (counts === null) {
      return errorEnvelope(
        `sync: cannot reach remote upstream '${probe.upstream}' (network or auth issue)`,
      );
    }
    if (counts.behind === 0 && counts.ahead === 0) {
      return okEnvelope({
        status: 'up-to-date',
        commitsBehind: 0,
        commitsAhead: 0,
        indexRegenerated: false,
      });
    }
    return okEnvelope({
      status: 'needs-sync',
      commitsBehind: counts.behind,
      commitsAhead: counts.ahead,
      indexRegenerated: false,
    });
  }

  if (!(await driversInstalled(input.cwd))) {
    return errorEnvelope(
      'sync: Zettelgeist merge drivers are not installed. ' +
        'Run `zettelgeist install-hook` once, then retry.',
    );
  }

  const fetchResult = await tryGit(['fetch', '--quiet'], input.cwd);
  if (!fetchResult.ok) {
    return errorEnvelope(`sync: git fetch failed — ${fetchResult.stderr}`);
  }

  const aheadResult = await tryGit(
    ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
    input.cwd,
  );
  if (!aheadResult.ok) {
    return errorEnvelope(`sync: cannot compare with upstream — ${aheadResult.stderr}`);
  }
  const [aheadStr = '0', behindStr = '0'] = aheadResult.stdout.trim().split(/\s+/);
  const ahead = Number.parseInt(aheadStr, 10) || 0;
  const behind = Number.parseInt(behindStr, 10) || 0;

  if (behind === 0 && ahead === 0) {
    return okEnvelope({
      status: 'up-to-date',
      commitsBehind: 0,
      commitsAhead: 0,
      indexRegenerated: false,
    });
  }

  if (!input.allowDirty) {
    const autoStashCfg = await tryGit(
      ['config', '--bool', '--get', 'rebase.autoStash'], input.cwd,
    );
    const autoStashOn = autoStashCfg.ok && autoStashCfg.stdout.trim() === 'true';
    if (!autoStashOn) {
      const dirty = await tryGit(['status', '--porcelain'], input.cwd);
      if (dirty.ok && dirty.stdout.trim().length > 0) {
        return errorEnvelope(
          'sync: working tree has uncommitted changes. ' +
            'Commit/stash, set `git config rebase.autoStash true`, or pass --allow-dirty.',
        );
      }
    }
  }

  if (behind > 0 && ahead === 0) {
    const ff = await tryGit(['merge', '--ff-only', probe.upstream], input.cwd);
    if (!ff.ok) return errorEnvelope(`sync: fast-forward failed — ${ff.stderr}`);
    const regen = await regenIndex(input.cwd);
    return okEnvelope({
      status: 'fast-forwarded',
      commitsBehind: behind,
      commitsAhead: 0,
      indexRegenerated: regen.committed,
      ...(regen.commitFailed ? { indexCommitFailed: true } : {}),
    });
  }

  // Diverged → rebase. On failure LEAVE the rebase active per spec; the
  // user resolves with editor + `git rebase --continue` (or --abort).
  const rebase = await tryGit(['rebase', probe.upstream], input.cwd);
  if (!rebase.ok) {
    const status = await tryGit(['diff', '--name-only', '--diff-filter=U'], input.cwd);
    const conflicted = status.ok
      ? status.stdout.trim().split('\n').filter(Boolean)
      : [];
    return errorEnvelope(
      `sync: rebase produced conflicts the drivers couldn't resolve. ` +
        `The rebase is still in progress — resolve the files below with your editor, ` +
        `then \`git add\` them and \`git rebase --continue\` (or \`git rebase --abort\` to bail).` +
        (conflicted.length > 0
          ? `\nConflicted files:\n  ${conflicted.join('\n  ')}`
          : `\nConflict detail:\n${rebase.stderr}`),
    );
  }

  const regen = await regenIndex(input.cwd);
  return okEnvelope({
    status: 'rebased',
    commitsBehind: behind,
    commitsAhead: ahead,
    indexRegenerated: regen.committed,
    ...(regen.commitFailed ? { indexCommitFailed: true } : {}),
  });
}

/**
 * Regenerate INDEX.md against the current working tree, commit if changed.
 * Returns:
 *  - `committed: true`     when a new INDEX commit landed
 *  - `commitFailed: true`  when EITHER the regen itself failed (e.g., the
 *    merged tree has a cycle that `runConformance` can't process) OR
 *    regen produced a change but the `git add`/`git commit` step failed.
 *    Caller MUST surface this. Silent failure would leave the working
 *    tree with a stale INDEX (or a dirty one) and confuse subsequent
 *    commands.
 */
async function regenIndex(cwd: string): Promise<{ committed: boolean; commitFailed: boolean }> {
  const { regenCommand } = await import('./regen.js');
  const result = await regenCommand({ path: cwd, check: false });
  if (!result.ok) {
    // Regen itself failed (e.g., post-rebase tree has a cycle that
    // `runConformance` can't process). The merged tree on disk is fine,
    // but INDEX wasn't refreshed. Surface this as `commitFailed:true` so
    // the CLI exits non-zero and the user knows to inspect the working
    // tree — silent failure leaves a stale INDEX and contradicts the
    // docstring's promise above.
    return { committed: false, commitFailed: true };
  }
  if (!result.data.changed) return { committed: false, commitFailed: false };

  // regenCommand returns `path` as an already-repo-relative posix path
  // (e.g., 'specs/INDEX.md'). Use it directly.
  const indexPath = result.data.path;

  const add = await tryGit(['add', indexPath], cwd);
  if (!add.ok) return { committed: false, commitFailed: true };

  const diff = await tryGit(['diff', '--cached', '--quiet'], cwd);
  if (diff.ok) return { committed: false, commitFailed: false }; // nothing staged

  const commit = await tryGit(
    ['commit', '-m', '[zg] regen INDEX after sync', '--no-verify'],
    cwd,
  );
  if (!commit.ok) return { committed: false, commitFailed: true };
  return { committed: true, commitFailed: false };
}
