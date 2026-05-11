import * as vscode from 'vscode';
import { openBoard } from './webview.js';
import { runRegen, runInstallHook } from './commands.js';

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('zettelgeist.open', () => openBoard(ctx)),
    vscode.commands.registerCommand('zettelgeist.regen', runRegen),
    vscode.commands.registerCommand('zettelgeist.installHook', runInstallHook),
  );
}

export function deactivate(): void {
  // Webview panel cleanup is handled by onDidDispose listeners in webview.ts.
}
