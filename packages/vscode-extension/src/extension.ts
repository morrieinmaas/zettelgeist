import * as vscode from 'vscode';
import { openBoard } from './webview.js';
import { runRegen, runInstallHook, runOpenInBrowser, stopServer } from './commands.js';
import { makeBackend } from './backend.js';
import { SpecTreeProvider } from './tree-provider.js';

export function activate(ctx: vscode.ExtensionContext): void {
  const cfg = () => vscode.workspace.getConfiguration('zettelgeist');

  ctx.subscriptions.push(
    vscode.commands.registerCommand('zettelgeist.open', () => {
      // Use the configured default view when invoked without a route.
      const view = cfg().get<string>('defaultView', 'board');
      const route = view === 'board' ? undefined : `/${view}`;
      return openBoard(ctx, route);
    }),
    vscode.commands.registerCommand('zettelgeist.openRoute', (route?: string) => openBoard(ctx, route)),
    vscode.commands.registerCommand('zettelgeist.regen', runRegen),
    vscode.commands.registerCommand('zettelgeist.installHook', runInstallHook),
    vscode.commands.registerCommand('zettelgeist.openInBrowser', runOpenInBrowser),
    // Cleanup: kill any spawned `zettelgeist serve` child when the extension
    // host shuts down. Otherwise the port stays bound after VSCode quits.
    { dispose: () => stopServer() },
  );

  // Auto-open the board on activation when the user has opted in. Activation
  // already requires a workspace with .zettelgeist.yaml (see activationEvents),
  // so we don't have to gate on that here.
  if (cfg().get<boolean>('autoOpenBoard', false)) {
    void vscode.commands.executeCommand('zettelgeist.open');
  }

  // Activity Bar side panel: lists specs grouped by status. Clicking a spec
  // opens the Board webview. Only register if there's a workspace folder.
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const backend = makeBackend(workspaceRoot);
    const provider = new SpecTreeProvider(backend);
    const view = vscode.window.createTreeView('zettelgeistSpecs', {
      treeDataProvider: provider,
      showCollapseAll: true,
    });
    ctx.subscriptions.push(
      view,
      vscode.commands.registerCommand('zettelgeist.refreshTree', () => provider.refresh()),
    );

    // Refresh the tree whenever a spec file changes on disk — covers both
    // edits from the Board webview (which writes via the backend) and edits
    // from the user typing into the markdown files directly.
    const watcher = vscode.workspace.createFileSystemWatcher('**/specs/**/*.md');
    watcher.onDidChange(() => provider.refresh());
    watcher.onDidCreate(() => provider.refresh());
    watcher.onDidDelete(() => provider.refresh());
    ctx.subscriptions.push(watcher);
  }
}

export function deactivate(): void {
  // Webview panel cleanup is handled by onDidDispose listeners in webview.ts.
}
