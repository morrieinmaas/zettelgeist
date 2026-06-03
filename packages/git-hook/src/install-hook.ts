import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { installMergeDrivers } from './install-merge-driver.js';

export const HOOK_MARKER_BEGIN = '# >>> zettelgeist >>>';
export const HOOK_MARKER_END = '# <<< zettelgeist <<<';

// Resolve the zettelgeist binary at hook execution time. Pre-commit hooks
// run with the user's login PATH, which won't include ./node_modules/.bin —
// so we fall back to the workspace-local binary if PATH lookup misses.
//
// Two pre-flight guards keep the hook from blocking commits in states
// where its check is meaningless:
//
//   1. No `.zettelgeist.yaml` → not a zettelgeist repo. A stale install
//      from a removed config or a partial init would otherwise fail every
//      commit with `error: not a zettelgeist repo`.
//
//   2. `specs/INDEX.md` not tracked in HEAD on this branch → the index
//      file isn't part of this branch's history (back-in-time checkout,
//      fresh repo before the first regen, branch that predates the
//      `init` commit). There's nothing to be stale about; without this
//      guard, `regen --check` fails with `specs/INDEX.md is missing` and
//      the user can't commit on the branch. We hardcode the `specs/`
//      path because `specs_dir` overrides are out of scope for the
//      shell-level guard; users who override can write their own hook.
export const HOOK_BLOCK =
  HOOK_MARKER_BEGIN + '\n' +
  '[ -f .zettelgeist.yaml ] || exit 0\n' +
  'git ls-files --error-unmatch specs/INDEX.md >/dev/null 2>&1 || exit 0\n' +
  'if command -v zettelgeist >/dev/null 2>&1; then\n' +
  '  zettelgeist regen --check\n' +
  'elif [ -x ./node_modules/.bin/zettelgeist ]; then\n' +
  '  ./node_modules/.bin/zettelgeist regen --check\n' +
  'else\n' +
  '  echo "zettelgeist: not on PATH and not in ./node_modules/.bin — install it or remove this hook" >&2\n' +
  '  exit 1\n' +
  'fi\n' +
  HOOK_MARKER_END;

const SHEBANG_RE = /^#!\s*\/[^\n]*\n/;

export function mergeHookContent(existing: string | null): string {
  if (existing === null || existing === '') return HOOK_BLOCK + '\n';

  const beginIdx = existing.indexOf(HOOK_MARKER_BEGIN);
  const endIdx = existing.indexOf(HOOK_MARKER_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + HOOK_MARKER_END.length);
    return before + HOOK_BLOCK + after;
  }

  const shebangMatch = existing.match(SHEBANG_RE);
  const stripped = shebangMatch
    ? existing.slice(shebangMatch[0].length).trim()
    : existing.trim();
  if (stripped === '') {
    return existing + HOOK_BLOCK + '\n';
  }

  throw new Error(
    'pre-commit hook contains non-marker content; refuse to overwrite. ' +
      'Use --force to back it up to pre-commit.before-zettelgeist and replace, ' +
      'or merge the marker block manually.'
  );
}

export async function installPreCommitHook(
  repoRoot: string,
  options: { force?: boolean } = {},
): Promise<{ installed: true; backup?: string }> {
  const hookDir = path.join(repoRoot, '.git', 'hooks');
  const hookPath = path.join(hookDir, 'pre-commit');
  await fs.mkdir(hookDir, { recursive: true });

  let existing: string | null = null;
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch {
    // file doesn't exist
  }

  let next: string;
  let backup: string | undefined;
  try {
    next = mergeHookContent(existing);
  } catch (err) {
    if (!options.force) throw err;
    backup = `${hookPath}.before-zettelgeist`;
    if (existing !== null) await fs.writeFile(backup, existing, 'utf8');
    next = HOOK_BLOCK + '\n';
  }

  await fs.writeFile(hookPath, next, 'utf8');
  await fs.chmod(hookPath, 0o755);

  // Also install the INDEX.md merge driver — same one-shot setup. Failing
  // here doesn't undo the hook install, but it would leave INDEX.md merges
  // back to the default "conflict markers" behavior, so we surface the
  // error to the caller rather than swallowing it.
  await installMergeDrivers(repoRoot);

  return backup ? { installed: true, backup } : { installed: true };
}
