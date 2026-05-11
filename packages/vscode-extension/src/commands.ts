import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
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

// Tracks an active `zettelgeist serve` child so we can reuse / kill it.
let serverProc: ChildProcess | null = null;
let serverOutput: vscode.OutputChannel | null = null;

export async function runOpenInBrowser(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Zettelgeist: open a workspace folder first.');
    return;
  }
  const cfg = vscode.workspace.getConfiguration('zettelgeist');
  const port = cfg.get<number>('serverPort', 7681);
  const host = cfg.get<string>('serverHost', '127.0.0.1');
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`;

  // If a server is already running, just open the browser.
  if (serverProc && !serverProc.killed) {
    void vscode.env.openExternal(vscode.Uri.parse(url));
    vscode.window.showInformationMessage(`Zettelgeist: opening ${url} (server already running)`);
    return;
  }

  // Resolve the zettelgeist CLI. Prefer a workspace-local `pnpm exec` or the
  // monorepo's built bin; fall back to a global `zettelgeist`.
  const command = resolveZettelgeistCommand(root);
  if (!command) {
    vscode.window.showErrorMessage(
      'Zettelgeist: could not find the `zettelgeist` CLI. ' +
        'Install it (`npm i -g @zettelgeist/cli`) or run from inside the monorepo.',
    );
    return;
  }

  serverOutput ??= vscode.window.createOutputChannel('Zettelgeist');
  serverOutput.clear();
  serverOutput.appendLine(`$ ${command.cmd} ${command.args.concat([`--port`, String(port), '--no-open']).join(' ')}`);
  serverOutput.appendLine(`(cwd: ${root})`);
  serverOutput.show(true);

  serverProc = spawn(command.cmd, [...command.args, 'serve', '--port', String(port), '--no-open'], {
    cwd: root,
    env: { ...process.env, HOST: host },
  });
  serverProc.stdout?.on('data', (d) => serverOutput?.append(String(d)));
  serverProc.stderr?.on('data', (d) => serverOutput?.append(String(d)));
  serverProc.on('exit', (code) => {
    serverOutput?.appendLine(`\n[server exited with code ${code}]`);
    serverProc = null;
  });

  // Give the server a moment to bind the port before we hit it.
  setTimeout(() => {
    void vscode.env.openExternal(vscode.Uri.parse(url));
  }, 600);
}

/**
 * Resolve a runnable CLI invocation. Priority:
 *  1. Local node_modules (`./node_modules/.bin/zettelgeist`)
 *  2. Monorepo build at `packages/cli/dist/bin.js` (covers contributors)
 *  3. Global `zettelgeist` on PATH
 */
function resolveZettelgeistCommand(root: string): { cmd: string; args: string[] } | null {
  const candidates: Array<{ cmd: string; args: string[]; check: string }> = [
    { cmd: 'node', args: [path.join(root, 'node_modules/@zettelgeist/cli/dist/bin.js')], check: path.join(root, 'node_modules/@zettelgeist/cli/dist/bin.js') },
    { cmd: 'node', args: [path.join(root, 'packages/cli/dist/bin.js')], check: path.join(root, 'packages/cli/dist/bin.js') },
  ];
  for (const c of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:fs').accessSync(c.check);
      return { cmd: c.cmd, args: c.args };
    } catch { /* not present, keep looking */ }
  }
  return { cmd: 'zettelgeist', args: [] };
}

export function stopServer(): void {
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
    serverProc = null;
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
