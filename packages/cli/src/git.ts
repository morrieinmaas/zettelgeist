import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const HOOK_MARKER_BEGIN = '# >>> zettelgeist >>>';
export const HOOK_MARKER_END = '# <<< zettelgeist <<<';
// Resolve the zettelgeist binary at hook execution time. Pre-commit hooks
// run with the user's login PATH, which won't include ./node_modules/.bin —
// so we fall back to the workspace-local binary if PATH lookup misses.
export const HOOK_BLOCK =
  HOOK_MARKER_BEGIN + '\n' +
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

export async function gitCommit(repoRoot: string, files: string[], message: string): Promise<string> {
  await execFileP('git', ['add', ...files], { cwd: repoRoot });
  await execFileP('git', ['commit', '-m', message], { cwd: repoRoot });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return stdout.trim();
}

export async function gitDefaultBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoRoot });
    return stdout.trim().replace(/^refs\/remotes\/origin\//, '');
  } catch {
    const { stdout } = await execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
    return stdout.trim();
  }
}

export async function gitRepoRoot(cwd: string): Promise<string> {
  const { stdout } = await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
}

export async function installPreCommitHook(
  repoRoot: string,
  options: { force?: boolean } = {},
): Promise<{ installed: boolean; backup?: string }> {
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
  return backup ? { installed: true, backup } : { installed: true };
}
