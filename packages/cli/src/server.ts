import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { handleSpecsRoute } from './handlers/specs.js';
import { handleDocsRoute } from './handlers/docs.js';
import { handleStaticRoute } from './handlers/static-assets.js';
import { sendJson, sendText } from './handlers/util.js';

export interface ServerOptions {
  cwd: string;
  port: number;
  viewerBundlePath?: string;   // override for tests
}

export interface ServerHandle {
  port: number;
  url: string;
  stop(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VIEWER_BUNDLE = path.resolve(here, 'viewer-bundle');

export async function startServer(opts: ServerOptions): Promise<ServerHandle> {
  const viewerBundle = opts.viewerBundlePath ?? DEFAULT_VIEWER_BUNDLE;

  const server = createServer((req, res) => {
    routeRequest(req, res, opts.cwd, viewerBundle).catch((err) => {
      console.error('server error:', err);
      try { sendJson(res, 500, { ok: false, error: { message: (err as Error).message } }); }
      catch { /* response already sent */ }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;
  const url = `http://127.0.0.1:${port}`;

  return {
    port,
    url,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
      });
    },
  };
}

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string,
  viewerBundle: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;

  // API routes
  if (pathname.startsWith('/api/specs')) {
    return handleSpecsRoute(req, res, cwd, pathname);
  }
  if (pathname === '/api/regenerate') {
    return handleRegenerate(req, res, cwd);
  }
  if (pathname === '/api/validation') {
    return handleValidation(req, res, cwd);
  }
  if (pathname.startsWith('/api/docs')) {
    return handleDocsRoute(req, res, cwd, pathname);
  }

  // User CSS override
  if (pathname === '/static/user-overrides.css') {
    return handleUserOverride(req, res, cwd);
  }

  // Viewer assets and root index.html
  return handleStaticRoute(req, res, viewerBundle, pathname, cwd);
}

async function handleRegenerate(_req: IncomingMessage, res: ServerResponse, cwd: string): Promise<void> {
  const { regenCommand } = await import('./commands/regen.js');
  const result = await regenCommand({ path: cwd, check: false });
  sendJson(res, result.ok ? 200 : 500, result);
}

async function handleValidation(_req: IncomingMessage, res: ServerResponse, cwd: string): Promise<void> {
  const { validateCommand } = await import('./commands/validate.js');
  const result = await validateCommand({ path: cwd });
  sendJson(res, 200, result);
}

async function handleUserOverride(_req: IncomingMessage, res: ServerResponse, cwd: string): Promise<void> {
  const userCss = path.join(cwd, '.zettelgeist', 'render-templates', 'viewer.css');
  try {
    const content = await fs.readFile(userCss, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(content);
  } catch {
    sendText(res, 404, '/* no user overrides */');
  }
}
