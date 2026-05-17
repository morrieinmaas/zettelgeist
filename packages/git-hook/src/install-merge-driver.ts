import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// Differentiated marker pair: .gitattributes uses `gitattributes` in the
// tag, the post-merge hook uses `post-merge`. They MUST NOT collide —
// otherwise our smart-merge could rip out the wrong block if a user
// happens to paste content from one file into the other.
export const GITATTRS_MARKER_BEGIN = '# >>> zettelgeist:gitattributes >>>';
export const GITATTRS_MARKER_END = '# <<< zettelgeist:gitattributes <<<';

/**
 * The block written into `.gitattributes`. Wrapped in marker comments so we
 * can smart-merge with any pre-existing user content.
 *
 * For `specs/INDEX.md` we use git's built-in `merge=union` strategy rather
 * than a custom driver. Reason: custom merge drivers are invoked per-file in
 * tree order, BEFORE git applies clean adds from the other branch. So a
 * driver that wanted to "regenerate INDEX from the merged tree" would only
 * see a partial tree at invocation time. `merge=union` produces a junk
 * concatenation, but the `post-merge` hook (installed below) fires AFTER
 * the entire merge completes, runs `zettelgeist regen` against the now-
 * fully-merged tree, and commits the corrected INDEX as a follow-up.
 */
export const GITATTRS_BLOCK =
  GITATTRS_MARKER_BEGIN + '\n' +
  '# INDEX.md is fully derived. Treat the merge as union (no markers),\n' +
  '# then the post-merge hook regenerates it from the merged tree.\n' +
  '# See `zettelgeist install-hook`.\n' +
  'specs/INDEX.md merge=union\n' +
  '# tasks.md merges semantically (per-task: either-checked wins, tags\n' +
  '# union, prose from `ours` preserved). The custom driver lives at\n' +
  '# `zettelgeist merge-driver tasks` and is wired into .git/config by\n' +
  '# install-hook.\n' +
  'specs/*/tasks.md merge=zettelgeist-tasks\n' +
  '# requirements.md frontmatter merges field-by-field (status with conflict\n' +
  '# marker if divergent, lists union, scalars with conflict marker if both\n' +
  '# non-empty differ); body merged textually.\n' +
  'specs/*/requirements.md merge=zettelgeist-frontmatter\n' +
  GITATTRS_MARKER_END;

// Pre-v0.2.1 marker pair (un-namespaced). We still recognise it so
// re-installing on top of an older install replaces the old block in
// place rather than orphaning it. Going forward, new installs always
// write the namespaced markers above.
const LEGACY_GITATTRS_MARKER_BEGIN = '# >>> zettelgeist >>>';
const LEGACY_GITATTRS_MARKER_END = '# <<< zettelgeist <<<';

/**
 * Smart-merge our block into an existing `.gitattributes`. Idempotent —
 * re-installing finds the marker pair and replaces the region between them.
 * Also picks up the legacy un-namespaced pair so older installs upgrade
 * cleanly.
 */
export function mergeGitAttributes(existing: string | null): string {
  if (existing === null || existing === '') return GITATTRS_BLOCK + '\n';

  for (const [begin, end] of [
    [GITATTRS_MARKER_BEGIN, GITATTRS_MARKER_END],
    [LEGACY_GITATTRS_MARKER_BEGIN, LEGACY_GITATTRS_MARKER_END],
  ] as const) {
    const beginIdx = existing.indexOf(begin);
    const endIdx = existing.indexOf(end);
    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
      const before = existing.slice(0, beginIdx);
      const after = existing.slice(endIdx + end.length);
      return before + GITATTRS_BLOCK + after;
    }
  }

  const sep = existing.endsWith('\n') ? '' : '\n';
  return existing + sep + GITATTRS_BLOCK + '\n';
}

export const POST_MERGE_MARKER_BEGIN = '# >>> zettelgeist:post-merge >>>';
export const POST_MERGE_MARKER_END = '# <<< zettelgeist:post-merge <<<';

/**
 * Body of `.git/hooks/post-merge`. Fires after `git merge` completes
 * (including fast-forwards and `git pull` merges). Regenerates `INDEX.md`
 * from the post-merge tree and commits any change as a `[zg] regen INDEX
 * after merge` follow-up. If INDEX is already current, the hook is a no-op.
 */
export const POST_MERGE_BLOCK =
  POST_MERGE_MARKER_BEGIN + '\n' +
  '# Regenerate specs/INDEX.md after a merge so it reflects the merged tree.\n' +
  '# Pairs with `specs/INDEX.md merge=union` in .gitattributes.\n' +
  'if command -v zettelgeist >/dev/null 2>&1; then\n' +
  '  ZG=zettelgeist\n' +
  'elif [ -x ./node_modules/.bin/zettelgeist ]; then\n' +
  '  ZG=./node_modules/.bin/zettelgeist\n' +
  'else\n' +
  '  echo "zettelgeist: not on PATH; skipping post-merge INDEX regen" >&2\n' +
  '  exit 0\n' +
  'fi\n' +
  '"$ZG" regen >/dev/null\n' +
  'if ! git diff --quiet specs/INDEX.md 2>/dev/null; then\n' +
  '  git add specs/INDEX.md\n' +
  '  git commit -m "[zg] regen INDEX after merge" --no-verify >/dev/null\n' +
  'fi\n' +
  POST_MERGE_MARKER_END;

const SHEBANG_RE = /^#!\s*\/[^\n]*\n/;

// Same legacy-marker treatment as .gitattributes — see comment above.
const LEGACY_POST_MERGE_MARKER_BEGIN = '# >>> zettelgeist >>>';
const LEGACY_POST_MERGE_MARKER_END = '# <<< zettelgeist <<<';

export function mergePostMergeContent(existing: string | null): string {
  if (existing === null || existing === '') return POST_MERGE_BLOCK + '\n';

  for (const [begin, end] of [
    [POST_MERGE_MARKER_BEGIN, POST_MERGE_MARKER_END],
    [LEGACY_POST_MERGE_MARKER_BEGIN, LEGACY_POST_MERGE_MARKER_END],
  ] as const) {
    const beginIdx = existing.indexOf(begin);
    const endIdx = existing.indexOf(end);
    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
      const before = existing.slice(0, beginIdx);
      const after = existing.slice(endIdx + end.length);
      return before + POST_MERGE_BLOCK + after;
    }
  }

  const shebangMatch = existing.match(SHEBANG_RE);
  const stripped = shebangMatch
    ? existing.slice(shebangMatch[0].length).trim()
    : existing.trim();
  if (stripped === '') {
    return existing + POST_MERGE_BLOCK + '\n';
  }

  throw new Error(
    'post-merge hook contains non-marker content; refuse to overwrite. ' +
      'Add the marker block manually or remove the existing hook.',
  );
}

/**
 * Configure the merge strategy for `specs/INDEX.md` and install the
 * `post-merge` hook that regenerates it after every merge.
 *
 * Writes:
 *  1. `.gitattributes` (tracked, shared) — `specs/INDEX.md merge=union`
 *  2. `.git/hooks/post-merge` (local, per-clone) — regen + commit
 *
 * Also strips any legacy `merge.zettelgeist-index.*` config entries from
 * an earlier driver-based approach. Idempotent.
 */
export async function installMergeDrivers(
  repoRoot: string,
): Promise<{ configured: true; postMergeBackup?: string }> {
  // 1. .gitattributes — smart-merge with marker block.
  const gaPath = path.join(repoRoot, '.gitattributes');
  let existingAttrs: string | null = null;
  try {
    existingAttrs = await fs.readFile(gaPath, 'utf8');
  } catch {
    /* file may not exist; mergeGitAttributes handles that */
  }
  await fs.writeFile(gaPath, mergeGitAttributes(existingAttrs), 'utf8');

  // 2. .git/hooks/post-merge — smart-merge with marker block.
  const hookDir = path.join(repoRoot, '.git', 'hooks');
  const hookPath = path.join(hookDir, 'post-merge');
  await fs.mkdir(hookDir, { recursive: true });
  let existingHook: string | null = null;
  try {
    existingHook = await fs.readFile(hookPath, 'utf8');
  } catch {
    /* hook may not exist */
  }
  let next: string;
  let backup: string | undefined;
  try {
    next = mergePostMergeContent(existingHook);
  } catch {
    // Non-marker hook present. Back it up and replace — same semantics as
    // the pre-commit `--force` path. The pre-commit caller already opted
    // into "yes, overwrite my hooks" by calling install-hook.
    backup = `${hookPath}.before-zettelgeist`;
    if (existingHook !== null) await fs.writeFile(backup, existingHook, 'utf8');
    next = POST_MERGE_BLOCK + '\n';
  }
  await fs.writeFile(hookPath, next, 'utf8');
  await fs.chmod(hookPath, 0o755);

  // 3. Register the `zettelgeist-tasks` custom driver in .git/config. The
  // tasks.md case CAN use a driver (unlike INDEX) because tasks.md merging
  // doesn't depend on any other file's state — the driver gets all the info
  // it needs from %O/%A/%B.
  await execFileP(
    'git',
    [
      '-C', repoRoot, 'config', 'merge.zettelgeist-tasks.name',
      'Zettelgeist tasks.md three-way merge',
    ],
  );
  await execFileP(
    'git',
    [
      '-C', repoRoot, 'config', 'merge.zettelgeist-tasks.driver',
      'zettelgeist merge-driver tasks %O %A %B',
    ],
  );

  // 4. Register the `zettelgeist-frontmatter` driver. Same justification as
  //    tasks — requirements.md's frontmatter is self-contained.
  await execFileP(
    'git',
    [
      '-C', repoRoot, 'config', 'merge.zettelgeist-frontmatter.name',
      'Zettelgeist requirements.md YAML frontmatter merge',
    ],
  );
  await execFileP(
    'git',
    [
      '-C', repoRoot, 'config', 'merge.zettelgeist-frontmatter.driver',
      'zettelgeist merge-driver frontmatter %O %A %B',
    ],
  );

  // Strip any stale `merge.zettelgeist-index.*` entries left over from a
  // prior driver-based attempt at the INDEX problem. (The current strategy
  // for INDEX is post-merge regen, not a driver.) Each call is no-op if the
  // entry is absent.
  await execFileP('git', ['-C', repoRoot, 'config', '--unset', 'merge.zettelgeist-index.name'])
    .catch(() => undefined);
  await execFileP('git', ['-C', repoRoot, 'config', '--unset', 'merge.zettelgeist-index.driver'])
    .catch(() => undefined);
  await execFileP('git', ['-C', repoRoot, 'config', '--remove-section', 'merge.zettelgeist-index'])
    .catch(() => undefined);

  return backup ? { configured: true, postMergeBackup: backup } : { configured: true };
}
