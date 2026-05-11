import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { sendNotFound } from './util.js';

const REST_BACKEND_SHIM = `
(() => {
  const json = async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(\`\${opts?.method || 'GET'} \${url} → \${r.status}\`);
    return r.json();
  };
  const post = (url, body) => json(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const put = (url, body) => json(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const patch = (url, body) => json(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const enc = encodeURIComponent;
  window.zettelgeistBackend = {
    listSpecs: () => json('/api/specs'),
    readSpec: (name) => json(\`/api/specs/\${enc(name)}\`),
    readSpecFile: (name, rel) => json(\`/api/specs/\${enc(name)}/files/\${rel.split('/').map(enc).join('/')}\`),
    validateRepo: () => json('/api/validation'),
    listDocs: () => json('/api/docs'),
    readDoc: (p) => json(\`/api/docs/\${p.split('/').map(enc).join('/')}\`),
    writeDoc: (p, content) => put(\`/api/docs/\${p.split('/').map(enc).join('/')}\`, { content }),
    renameDoc: (oldPath, newPath) => post(\`/api/docs/\${oldPath.split('/').map(enc).join('/')}/rename\`, { newPath }),
    writeSpecFile: (name, rel, content) => put(\`/api/specs/\${enc(name)}/files/\${rel.split('/').map(enc).join('/')}\`, { content }),
    tickTask: (name, n) => post(\`/api/specs/\${enc(name)}/tasks/\${n}/tick\`),
    untickTask: (name, n) => post(\`/api/specs/\${enc(name)}/tasks/\${n}/untick\`),
    setStatus: (name, status, reason) => post(\`/api/specs/\${enc(name)}/status\`, { status, reason }),
    patchFrontmatter: (name, fmPatch) => patch(\`/api/specs/\${enc(name)}/frontmatter\`, { patch: fmPatch }),
    writeHandoff: (name, content) => put(\`/api/specs/\${enc(name)}/handoff\`, { content }),
    regenerateIndex: () => post('/api/regenerate'),
    claimSpec: (name, agentId) => post(\`/api/specs/\${enc(name)}/claim\`, { agent_id: agentId }),
    releaseSpec: (name) => post(\`/api/specs/\${enc(name)}/release\`),
  };
})();
`;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

export async function handleStaticRoute(
  req: IncomingMessage,
  res: ServerResponse,
  viewerBundle: string,
  pathname: string,
  _cwd: string,
): Promise<void> {
  if (req.method !== 'GET') {
    sendNotFound(res);
    return;
  }

  // Root or /index.html → serve index.html with config injection
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(viewerBundle, 'index.html');
    let html: string;
    try {
      html = await fs.readFile(indexPath, 'utf8');
    } catch {
      sendNotFound(res);
      return;
    }

    // Inject window.zettelgeistConfig + REST-backed window.zettelgeistBackend
    // before main.js loads. Theme key not yet present in core config — default
    // to 'system'.
    const theme = 'system';
    const inject =
      `<script>window.zettelgeistConfig = { theme: ${JSON.stringify(theme)} };</script>\n` +
      `<script>${REST_BACKEND_SHIM}</script>`;
    html = html.replace(
      /<script\s+type="module"\s+src="\.\/main\.js"/i,
      `${inject}\n<script type="module" src="./main.js"`,
    );

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Strip leading slash; map / and /static/ both to viewerBundle for simplicity
  const rel = pathname.replace(/^\/(static\/)?/, '');
  const ext = path.extname(rel).toLowerCase();
  if (!MIME_TYPES[ext]) {
    sendNotFound(res);
    return;
  }
  const filePath = path.join(viewerBundle, rel);
  // Path-traversal guard
  if (!filePath.startsWith(viewerBundle + path.sep)) {
    sendNotFound(res);
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': `${MIME_TYPES[ext]}; charset=utf-8` });
    res.end(content);
  } catch {
    sendNotFound(res);
  }
}
