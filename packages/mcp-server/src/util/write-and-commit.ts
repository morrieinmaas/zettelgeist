import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';

const execFileP = promisify(execFile);

export async function writeFileAndCommit(
  cwd: string,
  fileRelPath: string,
  content: string,
  commitMessage: string,
): Promise<{ commit: string }> {
  const fileAbs = path.join(cwd, fileRelPath);
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  const tmp = `${fileAbs}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, fileAbs);

  // Regen
  const reader = makeDiskFsReader(cwd);
  const cfg = await loadConfig(reader);
  const result = await runConformance(reader);
  const indexAbs = path.join(cwd, cfg.config.specsDir, 'INDEX.md');
  let onDisk: string | null = null;
  try {
    onDisk = await fs.readFile(indexAbs, 'utf8');
  } catch {
    onDisk = null;
  }
  if (onDisk !== result.index) {
    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    const idxTmp = `${indexAbs}.tmp`;
    await fs.writeFile(idxTmp, result.index, 'utf8');
    await fs.rename(idxTmp, indexAbs);
  }

  const indexRel = path.posix.join(cfg.config.specsDir, 'INDEX.md');
  await execFileP('git', ['add', fileRelPath, indexRel], { cwd });
  await execFileP('git', ['commit', '-m', commitMessage], { cwd });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
  return { commit: stdout.trim() };
}
