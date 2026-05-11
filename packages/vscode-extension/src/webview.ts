import * as vscode from 'vscode';
import * as path from 'node:path';
import { makeBackend, type BackendRequest, type BackendResponse } from './backend.js';

let panel: vscode.WebviewPanel | undefined;

export async function openBoard(ctx: vscode.ExtensionContext): Promise<void> {
  if (panel) {
    panel.reveal();
    return;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Zettelgeist: open a workspace folder first.');
    return;
  }

  const bundleDir = vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview-bundle');

  panel = vscode.window.createWebviewPanel(
    'zettelgeist.board',
    'Zettelgeist',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [bundleDir],
    },
  );

  panel.webview.html = await renderShell(panel.webview, bundleDir);

  // Wire the message channel: webview posts BackendRequest, extension answers
  // with BackendResponse. The shim injected into the webview translates between
  // the ZettelgeistBackend interface and these messages.
  const backend = makeBackend(workspaceRoot);
  panel.webview.onDidReceiveMessage(async (msg: BackendRequest) => {
    try {
      const result = await backend.dispatch(msg);
      const response: BackendResponse = { id: msg.id, ok: true, result };
      panel?.webview.postMessage(response);
    } catch (err) {
      const response: BackendResponse = {
        id: msg.id,
        ok: false,
        error: (err as Error).message,
      };
      panel?.webview.postMessage(response);
    }
  });

  panel.onDidDispose(() => { panel = undefined; });
}

async function renderShell(webview: vscode.Webview, bundleDir: vscode.Uri): Promise<string> {
  const indexPath = vscode.Uri.joinPath(bundleDir, 'index.html');
  const raw = Buffer.from(await vscode.workspace.fs.readFile(indexPath)).toString('utf8');

  // Rewrite relative asset paths to webview URIs so VSCode's CSP accepts them.
  // `./pico.classless.min.css` → `vscode-webview://.../pico.classless.min.css`
  const baseUri = webview.asWebviewUri(bundleDir).toString() + '/';
  const rewritten = raw
    .replace(/href="\.\//g, `href="${baseUri}`)
    .replace(/src="\.\//g, `src="${baseUri}`);

  const nonce = makeNonce();
  const csp =
    `default-src 'none'; ` +
    `style-src ${webview.cspSource} 'unsafe-inline'; ` +
    `font-src ${webview.cspSource} data:; ` +
    `img-src ${webview.cspSource} data:; ` +
    `script-src 'nonce-${nonce}'; ` +
    `connect-src ${webview.cspSource};`;

  const theme = themeFromVSCode();
  const shim = `<script nonce="${nonce}">${BACKEND_SHIM}</script>`;
  const config = `<script nonce="${nonce}">window.zettelgeistConfig = ${JSON.stringify({ theme })};</script>`;

  const withCsp = rewritten.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  const withScripts = withCsp.replace(
    /<script\s+type="module"\s+src="/i,
    `${config}\n${shim}\n<script nonce="${nonce}" type="module" src="`,
  );
  return withScripts;
}

function themeFromVSCode(): 'light' | 'dark' | 'system' {
  const setting = vscode.workspace.getConfiguration('zettelgeist').get<string>('theme', 'auto');
  if (setting === 'light' || setting === 'dark') return setting;
  const kind = vscode.window.activeColorTheme.kind;
  if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) return 'light';
  return 'dark';
}

function makeNonce(): string {
  // 16 bytes, base64 — enough entropy for CSP nonce purposes.
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 24; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// Backend shim injected into the webview. Translates the ZettelgeistBackend
// method calls into postMessage requests and awaits responses. Each call gets
// a unique id; the host posts {id, ok, result|error} back.
const BACKEND_SHIM = `
(() => {
  const vscode = acquireVsCodeApi();
  let nextId = 0;
  const pending = new Map();

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg.id !== 'number') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || 'backend error'));
  });

  function call(method, args) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      vscode.postMessage({ id, method, args });
    });
  }

  window.zettelgeistBackend = {
    listSpecs:           ()                  => call('listSpecs', []),
    readSpec:            (name)              => call('readSpec', [name]),
    readSpecFile:        (name, rel)         => call('readSpecFile', [name, rel]),
    validateRepo:        ()                  => call('validateRepo', []),
    listDocs:            ()                  => call('listDocs', []),
    readDoc:             (p)                 => call('readDoc', [p]),
    writeSpecFile:       (name, rel, c)      => call('writeSpecFile', [name, rel, c]),
    tickTask:            (name, n)           => call('tickTask', [name, n]),
    untickTask:          (name, n)           => call('untickTask', [name, n]),
    setStatus:           (name, s, r)        => call('setStatus', [name, s, r]),
    patchFrontmatter:    (name, p)           => call('patchFrontmatter', [name, p]),
    writeHandoff:        (name, c)           => call('writeHandoff', [name, c]),
    regenerateIndex:     ()                  => call('regenerateIndex', []),
    claimSpec:           (name, a)           => call('claimSpec', [name, a]),
    releaseSpec:         (name)              => call('releaseSpec', [name]),
  };
})();
`;

// Keep TS happy about unused import in some build modes.
void path;
