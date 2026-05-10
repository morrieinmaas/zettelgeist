import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  loadAllSpecs, loadSpec, deriveStatus, loadConfig,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { sendJson, sendNotFound, readBody } from './util.js';

const execFileP = promisify(execFile);

interface SpecsRouteContext {
  cwd: string;
  specsDir: string;
}

async function getContext(cwd: string): Promise<SpecsRouteContext> {
  const reader = makeDiskFsReader(cwd);
  const cfg = await loadConfig(reader);
  return { cwd, specsDir: cfg.config.specsDir };
}

export async function handleSpecsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string,
  pathname: string,
): Promise<void> {
  const ctx = await getContext(cwd);

  // Listing: GET /api/specs
  if (pathname === '/api/specs' && req.method === 'GET') {
    return listSpecs(res, ctx);
  }

  // Spec-scoped: /api/specs/<name>...
  const m = pathname.match(/^\/api\/specs\/([^/]+)(.*)$/);
  if (!m) return sendNotFound(res);
  const name = decodeURIComponent(m[1]!);
  const rest = m[2] ?? '';

  // GET /api/specs/<name>
  if (rest === '' && req.method === 'GET') {
    return readSpecDetail(res, ctx, name);
  }

  // /api/specs/<name>/files/<path...>
  const filesMatch = rest.match(/^\/files\/(.+)$/);
  if (filesMatch) {
    const relpath = decodeURIComponent(filesMatch[1]!);
    if (req.method === 'GET') return readSpecFile(res, ctx, name, relpath);
    if (req.method === 'PUT') return writeSpecFile(req, res, ctx, name, relpath);
    return sendNotFound(res);
  }

  // POST /api/specs/<name>/tasks/<n>/tick   |  /untick
  const taskMatch = rest.match(/^\/tasks\/(\d+)\/(tick|untick)$/);
  if (taskMatch && req.method === 'POST') {
    const n = parseInt(taskMatch[1]!, 10);
    const op = taskMatch[2] as 'tick' | 'untick';
    return tickTask(res, ctx, name, n, op === 'tick');
  }

  // POST /api/specs/<name>/status
  if (rest === '/status' && req.method === 'POST') {
    return setStatus(req, res, ctx, name);
  }

  // POST /api/specs/<name>/claim   |  /release
  if (rest === '/claim' && req.method === 'POST') {
    return claimSpec(req, res, ctx, name);
  }
  if (rest === '/release' && req.method === 'POST') {
    return releaseSpec(res, ctx, name);
  }

  // PUT /api/specs/<name>/handoff
  if (rest === '/handoff' && req.method === 'PUT') {
    return writeHandoff(req, res, ctx, name);
  }

  return sendNotFound(res);
}

async function listSpecs(res: ServerResponse, ctx: SpecsRouteContext): Promise<void> {
  const reader = makeDiskFsReader(ctx.cwd);
  const specs = await loadAllSpecs(reader, ctx.specsDir);
  const repoState = { claimedSpecs: new Set<string>(), mergedSpecs: new Set<string>() };
  const out = specs.map((s) => {
    const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
    const checked = counted.filter((t) => t.checked).length;
    const blockedBy = typeof s.frontmatter.blocked_by === 'string' && s.frontmatter.blocked_by.trim() !== ''
      ? s.frontmatter.blocked_by.trim()
      : null;
    return {
      name: s.name,
      status: deriveStatus(s, repoState),
      progress: `${checked}/${counted.length}`,
      blockedBy,
    };
  });
  sendJson(res, 200, out);
}

async function readSpecDetail(res: ServerResponse, ctx: SpecsRouteContext, name: string): Promise<void> {
  const reader = makeDiskFsReader(ctx.cwd);
  try {
    const spec = await loadSpec(reader, name, ctx.specsDir);
    if (spec.requirements === null && spec.tasks.length === 0 && spec.handoff === null && spec.lenses.size === 0) {
      sendJson(res, 404, { error: 'spec not found' });
      return;
    }
    sendJson(res, 200, {
      name: spec.name,
      frontmatter: spec.frontmatter,
      requirements: spec.requirements,
      tasks: spec.tasks.map((t) => ({ index: t.index, checked: t.checked, text: t.text, tags: [...t.tags] })),
      handoff: spec.handoff,
      lenses: Object.fromEntries(spec.lenses),
    });
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}

async function readSpecFile(res: ServerResponse, ctx: SpecsRouteContext, name: string, relpath: string): Promise<void> {
  const filepath = path.join(ctx.cwd, ctx.specsDir, name, relpath);
  try {
    const content = await fs.readFile(filepath, 'utf8');
    sendJson(res, 200, { content });
  } catch (err) {
    sendJson(res, 404, { error: (err as Error).message });
  }
}

async function writeSpecFile(
  req: IncomingMessage, res: ServerResponse,
  ctx: SpecsRouteContext, name: string, relpath: string,
): Promise<void> {
  const body = await readBody(req) as { content?: string } | null;
  if (!body || typeof body.content !== 'string') {
    sendJson(res, 400, { error: 'body must be {content: string}' });
    return;
  }
  const fileRel = path.posix.join(ctx.specsDir, name, relpath);
  const fileAbs = path.join(ctx.cwd, fileRel);
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  const tmp = `${fileAbs}.tmp`;
  await fs.writeFile(tmp, body.content, 'utf8');
  await fs.rename(tmp, fileAbs);

  // Regen + commit
  const commit = await regenAndCommit(ctx, [fileRel], `[zg] write: ${name}/${relpath}`);
  sendJson(res, 200, { commit });
}

async function tickTask(
  res: ServerResponse, ctx: SpecsRouteContext, name: string, n: number, checked: boolean,
): Promise<void> {
  const tasksRel = path.posix.join(ctx.specsDir, name, 'tasks.md');
  const tasksAbs = path.join(ctx.cwd, tasksRel);
  let body: string;
  try {
    body = await fs.readFile(tasksAbs, 'utf8');
  } catch {
    sendJson(res, 404, { error: 'spec or tasks.md not found' });
    return;
  }
  const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+.*)$/;
  const lines = body.split('\n');
  let count = 0; let mutated = false;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i]?.match(TASK_LINE);
    if (!m) continue;
    count += 1;
    if (count === n) {
      lines[i] = m[1] + (checked ? 'x' : ' ') + m[3];
      mutated = true;
      break;
    }
  }
  if (!mutated) {
    sendJson(res, 400, { error: `no task at index ${n}` });
    return;
  }
  const tmp = `${tasksAbs}.tmp`;
  await fs.writeFile(tmp, lines.join('\n'), 'utf8');
  await fs.rename(tmp, tasksAbs);
  const op = checked ? 'tick' : 'untick';
  const commit = await regenAndCommit(ctx, [tasksRel], `[zg] ${op}: ${name}#${n}`);
  sendJson(res, 200, { commit });
}

async function setStatus(req: IncomingMessage, res: ServerResponse, ctx: SpecsRouteContext, name: string): Promise<void> {
  const body = await readBody(req) as { status?: string | null; reason?: string } | null;
  if (!body || (body.status !== null && body.status !== 'blocked' && body.status !== 'cancelled')) {
    sendJson(res, 400, { error: 'body.status must be "blocked", "cancelled", or null' });
    return;
  }
  const reqRel = path.posix.join(ctx.specsDir, name, 'requirements.md');
  const reqAbs = path.join(ctx.cwd, reqRel);
  const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
  const parsed = matter(raw, {});
  const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
  if (body.status === null) {
    delete data.status;
    delete data.blocked_by;
  } else {
    data.status = body.status;
    if (typeof body.reason === 'string') data.blocked_by = body.reason;
  }
  const newFrontmatter = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
  const content = newFrontmatter + (parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content);
  const tmp = `${reqAbs}.tmp`;
  await fs.mkdir(path.dirname(reqAbs), { recursive: true });
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, reqAbs);
  const commit = await regenAndCommit(ctx, [reqRel], `[zg] set-status: ${name}`);
  sendJson(res, 200, { commit });
}

async function claimSpec(req: IncomingMessage, res: ServerResponse, ctx: SpecsRouteContext, name: string): Promise<void> {
  const body = await readBody(req) as { agentId?: string } | null;
  const agentId = body?.agentId ?? 'agent';
  const dir = path.join(ctx.cwd, ctx.specsDir, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '.claim'), `${agentId}\n${new Date().toISOString()}\n`, 'utf8');
  sendJson(res, 200, { acknowledged: true });
}

async function releaseSpec(res: ServerResponse, ctx: SpecsRouteContext, name: string): Promise<void> {
  const claimPath = path.join(ctx.cwd, ctx.specsDir, name, '.claim');
  await fs.unlink(claimPath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
  sendJson(res, 200, { acknowledged: true });
}

async function writeHandoff(req: IncomingMessage, res: ServerResponse, ctx: SpecsRouteContext, name: string): Promise<void> {
  const body = await readBody(req) as { content?: string } | null;
  if (!body || typeof body.content !== 'string') {
    sendJson(res, 400, { error: 'body must be {content: string}' });
    return;
  }
  const handoffRel = path.posix.join(ctx.specsDir, name, 'handoff.md');
  const handoffAbs = path.join(ctx.cwd, handoffRel);
  await fs.mkdir(path.dirname(handoffAbs), { recursive: true });
  const tmp = `${handoffAbs}.tmp`;
  await fs.writeFile(tmp, body.content, 'utf8');
  await fs.rename(tmp, handoffAbs);
  const commit = await regenAndCommit(ctx, [handoffRel], `[zg] handoff: ${name}`);
  sendJson(res, 200, { commit });
}

async function regenAndCommit(ctx: SpecsRouteContext, files: string[], message: string): Promise<string> {
  // Run regen first
  const { regenCommand } = await import('../commands/regen.js');
  await regenCommand({ path: ctx.cwd, check: false });
  // Stage and commit
  const indexRel = path.posix.join(ctx.specsDir, 'INDEX.md');
  await execFileP('git', ['add', ...files, indexRel], { cwd: ctx.cwd });
  await execFileP('git', ['commit', '-m', message], { cwd: ctx.cwd });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: ctx.cwd });
  return stdout.trim();
}
