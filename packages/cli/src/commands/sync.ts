import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

const execFileP = promisify(execFile);

export const HELP = `zettelgeist sync [--check] [--json]

  Bring the local branch up to date with its upstream, auto-resolving
  Zettelgeist-managed file conflicts via the merge drivers installed by
  \`zettelgeist install-hook\`. Sequence:

    1. \`git fetch\` the current branch's upstream.
    2. If already up to date, exit 0.
    3. If only behind, fast-forward.
    4. If diverged, \`git rebase\` onto upstream. The registered merge
       drivers (tasks, frontmatter) and \`merge=union\` plus the post-merge
       hook (INDEX) auto-resolve format-managed files.
    5. Regenerate INDEX.md if not already current.

  When the merge produces a conflict the drivers cannot resolve (e.g.
  divergent prose in requirements.md body), \`sync\` aborts the rebase,
  leaves the working tree in a clean state, and exits non-zero so the
  user can resolve with their editor.

  Flags:
    --check  Read-only. Exits non-zero if a sync is needed; doesn't mutate.
             Useful in CI or before a mutating CLI action.
    --json   Emit a machine-readable envelope on stdout.

  Requires: an upstream branch to be configured (\`git push -u\` once).
`;

export interface SyncInput {
  cwd: string;
  check: boolean;
}

export type SyncStatus =
  | 'up-to-date'
  | 'fast-forwarded'
  | 'rebased'
  | 'needs-sync'      // --check only
  | 'no-upstream';

export interface SyncOk {
  status: SyncStatus;
  /** Commits brought in from upstream (excluding any [zg] follow-ups). */
  pulledCommits: number;
  /** Commits replayed locally during a rebase. */
  replayedCommits: number;
  /** True when INDEX.md was regenerated as part of the sync. */
  indexRegenerated: boolean;
}

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileP('git', args, { cwd });
}

async function tryGit(args: string[], cwd: string): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string; code: number }> {
  try {
    const r = await git(args, cwd);
    return { ok: true, stdout: r.stdout };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; code?: number };
    return { ok: false, stderr: e.stderr ?? e.stdout ?? String(err), code: e.code ?? 1 };
  }
}

async function getUpstream(cwd: string): Promise<string | null> {
  const r = await tryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
  if (!r.ok) return null;
  return r.stdout.trim();
}

export async function syncCommand(input: SyncInput): Promise<Envelope<SyncOk>> {
  // 1. Verify we're in a git repo + have an upstream.
  const upstreamRef = await getUpstream(input.cwd);
  if (upstreamRef === null) {
    if (input.check) {
      return okEnvelope({
        status: 'no-upstream',
        pulledCommits: 0,
        replayedCommits: 0,
        indexRegenerated: false,
      });
    }
    return errorEnvelope(
      'sync: no upstream configured for the current branch. ' +
        'Run `git push -u origin <branch>` once to set one.',
    );
  }

  // 2. Fetch (skipped in --check to keep it truly side-effect-free... actually
  //    a fetch updates remote-tracking refs which IS a side effect, but it's
  //    the only way to detect drift correctly. We do fetch in --check too.)
  const fetchResult = await tryGit(['fetch', '--quiet'], input.cwd);
  if (!fetchResult.ok) {
    return errorEnvelope(`sync: git fetch failed — ${fetchResult.stderr}`);
  }

  // 3. Determine local/remote relationship.
  const aheadResult = await tryGit(
    ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], input.cwd,
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
      pulledCommits: 0,
      replayedCommits: 0,
      indexRegenerated: false,
    });
  }

  if (input.check) {
    return okEnvelope({
      status: 'needs-sync',
      pulledCommits: behind,
      replayedCommits: ahead,
      indexRegenerated: false,
    });
  }

  // 4. Working tree must be clean for rebase / FF.
  const dirty = await tryGit(['status', '--porcelain'], input.cwd);
  if (dirty.ok && dirty.stdout.trim().length > 0) {
    return errorEnvelope(
      'sync: working tree has uncommitted changes — commit or stash before syncing',
    );
  }

  if (behind > 0 && ahead === 0) {
    // Fast-forward.
    const ff = await tryGit(['merge', '--ff-only', upstreamRef], input.cwd);
    if (!ff.ok) return errorEnvelope(`sync: fast-forward failed — ${ff.stderr}`);
    const indexRegenerated = await regenIndex(input.cwd);
    return okEnvelope({
      status: 'fast-forwarded',
      pulledCommits: behind,
      replayedCommits: 0,
      indexRegenerated,
    });
  }

  // Diverged: rebase local onto upstream.
  const rebase = await tryGit(['rebase', upstreamRef], input.cwd);
  if (!rebase.ok) {
    // Abort to leave the tree clean.
    await tryGit(['rebase', '--abort'], input.cwd);
    return errorEnvelope(
      `sync: rebase produced unresolvable conflicts. Aborted; working tree restored.\n` +
        `Resolve manually with \`git pull --rebase\` and your editor.\n` +
        `Conflict detail:\n${rebase.stderr}`,
    );
  }

  const indexRegenerated = await regenIndex(input.cwd);
  return okEnvelope({
    status: 'rebased',
    pulledCommits: behind,
    replayedCommits: ahead,
    indexRegenerated,
  });
}

/**
 * Regenerate INDEX.md against the current working tree, commit if changed.
 * Returns true when a regen commit was created. Best-effort: failure to
 * regen doesn't fail the sync — the user can run `regen` manually.
 */
async function regenIndex(cwd: string): Promise<boolean> {
  // Use the bundled regen command in-process via a dynamic import so we
  // don't shell out to ourselves. This keeps the test surface clean.
  const { regenCommand } = await import('./regen.js');
  const result = await regenCommand({ path: cwd, check: false });
  if (!result.ok) return false;
  if (!result.data.changed) return false;

  // Commit the regenerated INDEX if it differs from HEAD.
  const indexRel = path.posix.join(
    path.relative(cwd, path.dirname(result.data.path)).split(path.sep).join('/'),
    'INDEX.md',
  );
  const indexPath = indexRel === 'INDEX.md' ? 'specs/INDEX.md' : indexRel;

  await tryGit(['add', indexPath], cwd);
  const diff = await tryGit(['diff', '--cached', '--quiet'], cwd);
  if (diff.ok) {
    // No staged changes after add — nothing to commit.
    return false;
  }
  const commitResult = await tryGit(
    ['commit', '-m', '[zg] regen INDEX after sync', '--no-verify'], cwd,
  );
  return commitResult.ok;
}

// Used by tests as a hatch to keep the file from getting tree-shaken.
export const __TEST_ONLY = { regenIndex };
void fs;
