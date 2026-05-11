import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { installPreCommitHook } from '@zettelgeist/git-hook';

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function runRegen(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Zettelgeist: open a workspace folder first.');
    return;
  }
  try {
    const reader = makeDiskFsReader(root);
    const cfg = await loadConfig(reader);
    const result = await runConformance(reader);
    const indexAbs = path.join(root, cfg.config.specsDir, 'INDEX.md');
    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    await fs.writeFile(indexAbs, result.index, 'utf8');
    vscode.window.showInformationMessage(
      `Zettelgeist: regenerated ${cfg.config.specsDir}/INDEX.md`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Zettelgeist regen failed: ${(err as Error).message}`);
  }
}

export async function runInstallHook(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Zettelgeist: open a workspace folder first.');
    return;
  }
  try {
    const result = await installPreCommitHook(root, { force: false });
    const msg = result.backup
      ? `Zettelgeist: pre-commit hook installed (existing hook backed up to ${result.backup}).`
      : 'Zettelgeist: pre-commit hook installed.';
    vscode.window.showInformationMessage(msg);
  } catch (err) {
    vscode.window.showErrorMessage(`Zettelgeist install-hook failed: ${(err as Error).message}`);
  }
}
