import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { sendNotFound } from './util.js';

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

    // Inject window.zettelgeistConfig before main.js loads.
    // Theme key not yet present in core config — default to 'system'.
    const theme = 'system';
    const inject = `<script>window.zettelgeistConfig = { theme: ${JSON.stringify(theme)} };</script>`;
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
