import * as vscode from 'vscode';
import * as path from 'node:path';
import { makeBackend, type BackendRequest, type BackendResponse } from './backend.js';

let panel: vscode.WebviewPanel | undefined;

/**
 * Open (or reveal) the Zettelgeist board webview as an editor tab.
 *
 * @param route Optional in-app route (e.g. "/spec/user-auth", "/graph",
 *              "/docs"). If the panel is already open, posts a navigate
 *              message; if not, the panel boots with this hash pre-set.
 */
export async function openBoard(ctx: vscode.ExtensionContext, route?: string): Promise<void> {
  if (panel) {
    panel.reveal();
    if (route) panel.webview.postMessage({ kind: 'zg.navigate', route });
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

  panel.webview.html = await renderShell(panel.webview, bundleDir, route);

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

async function renderShell(webview: vscode.Webview, bundleDir: vscode.Uri, route?: string): Promise<string> {
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
  // Pre-set the URL hash before main.js loads, so the viewer's router
  // initializes on the requested deep-link route (spec detail, graph, docs).
  // Also wire a postMessage listener so subsequent navigations (clicking
  // another spec while the panel is already open) actually navigate.
  const initialHash = route
    ? `<script nonce="${nonce}">window.location.hash = ${JSON.stringify('#' + route)};</script>`
    : '';
  const navListener = `<script nonce="${nonce}">
    // Two webview-specific navigation fixes:
    //
    // 1. Hash-anchor clicks. The webview's strict CSP (default-src 'none')
    //    blocks <a href="#/..."> from changing window.location, so the nav
    //    bar buttons + "Back to board" link silently no-op. Intercept any
    //    click on an anchor whose href starts with "#" and set the hash
    //    programmatically — the router then fires hashchange normally.
    //
    // 2. postMessage navigation from the tree view (extension host).
    document.addEventListener('click', (e) => {
      let t = e.target;
      while (t && t.nodeType === 1) {
        if (t.tagName === 'A') {
          const href = t.getAttribute('href') || '';
          if (href.startsWith('#')) {
            e.preventDefault();
            window.location.hash = href;
            return;
          }
        }
        t = t.parentElement;
      }
    });
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m && m.kind === 'zg.navigate' && typeof m.route === 'string') {
        window.location.hash = '#' + m.route;
      }
    });
  </script>`;

  // VSCode theme bridge: map our Pico CSS variables onto the editor's
  // --vscode-* variables. Without this, the viewer's own light/dark CSS
  // wins and the panel looks like a separate app. With it, the panel
  // adopts whatever theme the editor is using (Dracula, Solarized, etc.).
  // Inline + appended late so it overrides the cascade.
  const themeBridge = `<style nonce="${nonce}">${VSCODE_THEME_BRIDGE}</style>`;

  const withCsp = rewritten.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  const withTheme = withCsp.replace('</head>', `${themeBridge}\n</head>`);
  const withScripts = withTheme.replace(
    /<script\s+type="module"\s+src="/i,
    `${config}\n${shim}\n${initialHash}\n${navListener}\n<script nonce="${nonce}" type="module" src="`,
  );
  return withScripts;
}

// CSS that overrides the viewer's Pico variables with VSCode theme tokens so
// the panel feels native. Applies regardless of the viewer's data-theme.
const VSCODE_THEME_BRIDGE = `
:root, [data-theme='light'], [data-theme='dark'] {
  --pico-background-color: var(--vscode-editor-background) !important;
  --pico-color: var(--vscode-editor-foreground) !important;
  --pico-card-background-color: var(--vscode-sideBar-background, var(--vscode-editorWidget-background)) !important;
  --pico-muted-border-color: var(--vscode-panel-border, var(--vscode-input-border, #444)) !important;
  --pico-muted-color: var(--vscode-descriptionForeground) !important;
  --pico-primary: var(--vscode-textLink-foreground) !important;

  /* Secondary button palette — pulls from VSCode's button + border tokens
     so secondary actions read as buttons in whatever theme is active. */
  --zg-btn-bg: var(--vscode-button-secondaryBackground, var(--vscode-editor-background)) !important;
  --zg-btn-border: var(--vscode-button-border, var(--vscode-panel-border, #444)) !important;
  --zg-btn-fg: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground)) !important;
  --zg-btn-fg-hover: var(--vscode-textLink-foreground) !important;
}
body {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

/* The editor's color theme drives the look — the in-viewer light/dark
   toggle would only fight with it. Hide it in the VSCode webview context. */
button.zg-theme-toggle { display: none !important; }
`;

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
    writeDoc:            (p, c)              => call('writeDoc', [p, c]),
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
