import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export {
  HOOK_BLOCK,
  HOOK_MARKER_BEGIN,
  HOOK_MARKER_END,
  mergeHookContent,
  installPreCommitHook,
} from '@zettelgeist/git-hook';

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
