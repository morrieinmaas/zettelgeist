import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { renderMarkdownBody } from '../render.js';
import { sendJson, sendNotFound } from './util.js';

const DOCS_ROOTS = ['docs', 'spec', 'README.md'];

export async function handleDocsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string,
  pathname: string,
): Promise<void> {
  if (pathname === '/api/docs' && req.method === 'GET') {
    return listDocs(res, cwd);
  }
  const m = pathname.match(/^\/api\/docs\/(.+)$/);
  if (m && req.method === 'GET') {
    return readDoc(res, cwd, decodeURIComponent(m[1]!));
  }
  sendNotFound(res);
}

async function listDocs(res: ServerResponse, cwd: string): Promise<void> {
  const out: Array<{ path: string; title: string }> = [];
  for (const root of DOCS_ROOTS) {
    const abs = path.join(cwd, root);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      await walk(abs, cwd, out);
    } else if (stat.isFile() && abs.endsWith('.md')) {
      out.push({ path: root, title: await firstH1(abs) ?? root });
    }
  }
  sendJson(res, 200, out);
}

async function walk(dir: string, cwd: string, out: Array<{ path: string; title: string }>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, cwd, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      const rel = path.relative(cwd, full).split(path.sep).join('/');
      out.push({ path: rel, title: await firstH1(full) ?? rel });
    }
  }
}

async function firstH1(file: string): Promise<string | null> {
  try {
    const content = await fs.readFile(file, 'utf8');
    const m = content.match(/^#\s+(.+)$/m);
    return m?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function readDoc(res: ServerResponse, cwd: string, relpath: string): Promise<void> {
  // Path-traversal guard
  const abs = path.resolve(cwd, relpath);
  if (!abs.startsWith(path.resolve(cwd) + path.sep) && abs !== path.resolve(cwd)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const content = await fs.readFile(abs, 'utf8');
    sendJson(res, 200, {
      rendered: renderMarkdownBody(content),
      metadata: { title: await firstH1(abs) ?? relpath },
    });
  } catch (err) {
    sendJson(res, 404, { error: (err as Error).message });
  }
}
