import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';
import { installPreCommitHook, gitRepoRoot } from '../git.js';

export interface InstallHookInput { path: string; force: boolean; }
export interface InstallHookOk { installed: true; backup?: string; }

export async function installHookCommand(input: InstallHookInput): Promise<Envelope<InstallHookOk>> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }
  let repoRoot: string;
  try {
    repoRoot = await gitRepoRoot(input.path);
  } catch {
    return errorEnvelope(`${input.path} is not a git repo`);
  }
  try {
    const result = await installPreCommitHook(repoRoot, { force: input.force });
    return okEnvelope({ installed: true, ...(result.backup ? { backup: result.backup } : {}) });
  } catch (err) {
    return errorEnvelope(err instanceof Error ? err.message : String(err));
  }
}
