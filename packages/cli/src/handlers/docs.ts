import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sendJson, sendNotFound, readBody } from './util.js';

const execFileP = promisify(execFile);

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
  if (m) {
    const relpath = decodeURIComponent(m[1]!);
    if (req.method === 'GET') return readDoc(res, cwd, relpath);
    if (req.method === 'PUT') return writeDoc(req, res, cwd, relpath);
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
  const abs = guardPath(cwd, relpath);
  if (!abs) { sendJson(res, 403, { error: 'forbidden' }); return; }
  try {
    const content = await fs.readFile(abs, 'utf8');
    // Return the raw source — the viewer renders + sanitizes it via the
    // shared markdown-editor component (which also supports inline editing).
    sendJson(res, 200, {
      source: content,
      metadata: { title: await firstH1(abs) ?? relpath },
    });
  } catch (err) {
    sendJson(res, 404, { error: (err as Error).message });
  }
}

async function writeDoc(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string,
  relpath: string,
): Promise<void> {
  const body = await readBody(req) as { content?: string } | null;
  if (!body || typeof body.content !== 'string') {
    sendJson(res, 400, { error: 'body must be {content: string}' });
    return;
  }
  const abs = guardPath(cwd, relpath);
  if (!abs) { sendJson(res, 403, { error: 'forbidden' }); return; }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  await fs.writeFile(tmp, body.content, 'utf8');
  await fs.rename(tmp, abs);

  // Commit — same idempotent-no-op pattern as the specs handlers.
  const rel = path.relative(cwd, abs).split(path.sep).join('/');
  await execFileP('git', ['add', rel], { cwd });
  try {
    await execFileP('git', ['diff', '--cached', '--quiet'], { cwd });
    const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
    sendJson(res, 200, { commit: stdout.trim() });
    return;
  } catch { /* diff present → commit */ }
  await execFileP('git', ['commit', '-m', `[zg] write-doc: ${rel}`], { cwd });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
  sendJson(res, 200, { commit: stdout.trim() });
}

function guardPath(cwd: string, relpath: string): string | null {
  const abs = path.resolve(cwd, relpath);
  const root = path.resolve(cwd);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}
