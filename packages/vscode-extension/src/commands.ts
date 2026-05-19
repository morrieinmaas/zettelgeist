import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  runConformance, loadConfig,
  DEFAULT_CONFIG, INIT_DIRS, gitignoreWithMarkerBlock,
} from '@zettelgeist/core';
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

/**
 * Initialize the open workspace as a Zettelgeist repo. Triggered from
 * the "Initialize…" tree item or the empty-state prompt when an
 * uninitialized workspace activates the extension. Mirrors `zettelgeist
 * init` from the CLI; kept inline so the extension doesn't need to shell
 * out for first-time onboarding (faster, no CLI-resolution failure path).
 */
export async function runInit(): Promise<boolean> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Zettelgeist: open a workspace folder first.');
    return false;
  }
  const cfgAbs = path.join(root, '.zettelgeist.yaml');
  try {
    await fs.access(cfgAbs);
    // Already initialized — surface a friendly notice instead of treating
    // this as an error path. Also refresh the tree so a stale init-prompt
    // node (e.g. when the user created .zettelgeist.yaml in another
    // window) is replaced by the real spec list. Without this the tree
    // stays on the prompt until the user manually hits refresh.
    vscode.window.showInformationMessage(
      'Zettelgeist: this workspace is already initialized.',
    );
    await vscode.commands.executeCommand('zettelgeist.refreshTree');
    return true;
  } catch {
    /* expected — proceed with init */
  }

  const confirm = await vscode.window.showInformationMessage(
    `Initialize Zettelgeist in ${path.basename(root)}?`,
    {
      modal: true,
      detail:
        'Creates .zettelgeist.yaml + specs/ + docs/ + .zettelgeist/ in the workspace root, ' +
        'and appends an ignore block to .gitignore. Nothing is committed; review the changes ' +
        'in your VCS before pushing.',
    },
    'Initialize',
  );
  if (confirm !== 'Initialize') return false;

  try {
    // .zettelgeist.yaml — the opt-in marker. Content lives in core's
    // init-defaults so the CLI and this extension write byte-identical
    // files (no drift between surfaces).
    await fs.writeFile(cfgAbs, DEFAULT_CONFIG, 'utf8');

    // Directory layout (specs/, docs/, .zettelgeist/) — set lives in
    // core's INIT_DIRS. mkdir({recursive}) is idempotent so a partially
    // initialized workspace heals on re-run.
    for (const dir of INIT_DIRS) {
      await fs.mkdir(path.join(root, dir), { recursive: true });
    }

    // Append our marker block to .gitignore so tool-managed state and
    // per-actor claims stay out of commits. The shared helper returns
    // null when the marker is already present (idempotent re-run).
    const giPath = path.join(root, '.gitignore');
    let giContent = '';
    try { giContent = await fs.readFile(giPath, 'utf8'); } catch { /* will create */ }
    const nextGi = gitignoreWithMarkerBlock(giContent);
    if (nextGi !== null) {
      await fs.writeFile(giPath, nextGi, 'utf8');
    }

    vscode.window.showInformationMessage(
      'Zettelgeist: workspace initialized. Open the board (Activity Bar → Zettelgeist) ' +
        'or run “Zettelgeist: Install Pre-commit Hook” to keep INDEX.md in sync on commits.',
    );
    // Refresh the tree provider so the empty-state node is replaced by
    // the real spec list (which will be empty for a fresh repo, but
    // accurate).
    await vscode.commands.executeCommand('zettelgeist.refreshTree');
    return true;
  } catch (err) {
    vscode.window.showErrorMessage(
      `Zettelgeist init failed: ${(err as Error).message}`,
    );
    return false;
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
