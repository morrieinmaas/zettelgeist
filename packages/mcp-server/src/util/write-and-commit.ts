import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeLogEntry, resolveAgentId } from './log-entry.js';

const execFileP = promisify(execFile);

export interface WriteAndCommitOptions {
  /**
   * If provided, also append an entry to `specs/<specName>/.log.md`
   * inside the same commit as the main file write. The action string
   * SHOULD be a short, deterministic rendering of the call shape, e.g.
   * `tick_task(2)` or `set_status(draft → in-progress)`.
   *
   * Agent attribution: if `agentId` is omitted, the helper scans the
   * spec folder for an active `.claim-<id>` file and uses that; if no
   * claim is present, falls back to `defaultAgentId()`.
   *
   * The log entry is skipped silently when no cycle is open — actions
   * outside a claim/release cycle don't have a home in the log. Callers
   * who want logging MUST `claim_spec` first.
   */
  log?: {
    specName: string;
    action: string;
    agentId?: string;
  };
  /**
   * Additional `{ relPath, content }` pairs written and committed
   * atomically with the main file. The helper performs the temp+rename
   * write BEFORE running conformance, so all files are on disk by the
   * time INDEX.md regenerates — keeping the failure mode symmetric with
   * the single-file path (a conformance throw leaves a consistent
   * working-tree diff rather than a half-applied state). Used by tools
   * that need a multi-file atomic edit, e.g. `tick_task` clearing a
   * `status: draft` override in requirements.md alongside the tick.
   */
  extraWrites?: ReadonlyArray<{ relPath: string; content: string }>;
}

export async function writeFileAndCommit(
  cwd: string,
  fileRelPath: string,
  content: string,
  commitMessage: string,
  options?: WriteAndCommitOptions,
): Promise<{ commit: string }> {
  const fileAbs = path.join(cwd, fileRelPath);
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  const tmp = `${fileAbs}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, fileAbs);

  // Stage any caller-supplied extra writes the same way (temp+rename)
  // BEFORE running conformance, so INDEX.md regenerates against the
  // post-write state of every file in this transaction.
  if (options?.extraWrites) {
    for (const w of options.extraWrites) {
      const abs = path.join(cwd, w.relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const t = `${abs}.tmp`;
      await fs.writeFile(t, w.content, 'utf8');
      await fs.rename(t, abs);
    }
  }

  // Regen — load config first so we can reuse it for the .log.md path too.
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
  const filesToAdd = [fileRelPath, indexRel];

  // Append to .log.md AFTER the main write so the log entry's timestamp
  // reflects the moment the work was committed.
  if (options?.log) {
    const agentId =
      options.log.agentId ??
      (await resolveAgentId({
        cwd,
        specsDir: cfg.config.specsDir,
        specName: options.log.specName,
      }));
    const { logRelPath, wrote } = await writeLogEntry({
      cwd,
      specsDir: cfg.config.specsDir,
      specName: options.log.specName,
      agentId,
      action: options.log.action,
    });
    // Only stage .log.md when something actually changed on disk —
    // the writer short-circuits on missing-file-without-open-cycle to
    // avoid materialising orphan-only logs.
    if (wrote) filesToAdd.push(logRelPath);
  }

  if (options?.extraWrites) {
    for (const w of options.extraWrites) filesToAdd.push(w.relPath);
  }

  await execFileP('git', ['add', ...filesToAdd], { cwd });
  await execFileP('git', ['commit', '-m', commitMessage], { cwd });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
  return { commit: stdout.trim() };
}
