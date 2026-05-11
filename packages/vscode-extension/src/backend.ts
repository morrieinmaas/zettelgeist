import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import {
  loadAllSpecs, loadSpec, deriveStatus, loadConfig, runConformance, validateRepo,
  type Status,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';

const execFileP = promisify(execFile);

export interface BackendRequest {
  id: number;
  method: string;
  args: unknown[];
}

export interface BackendResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Path traversal guard — refuses to escape its base.
function safeJoin(base: string, ...parts: string[]): string {
  const target = path.resolve(base, ...parts);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refused: path escapes ${base}`);
  }
  return target;
}

const ALLOWED_STATUSES = new Set<Status>([
  'draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled',
]);

const PATCH_FORBIDDEN_KEYS = new Set(['status', 'blocked_by']);

export function makeBackend(workspaceRoot: string) {
  // Lookup specsDir once per request via loadConfig — cheap, but cached state
  // would be wrong if the user edits .zettelgeist.yaml live.
  async function getCtx() {
    const reader = makeDiskFsReader(workspaceRoot);
    const cfg = await loadConfig(reader);
    return { cwd: workspaceRoot, specsDir: cfg.config.specsDir, reader };
  }

  async function regenAndCommit(filesRel: string[], commitMessage: string): Promise<string> {
    const { cwd, specsDir, reader } = await getCtx();
    const result = await runConformance(reader);
    const indexAbs = path.join(cwd, specsDir, 'INDEX.md');
    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    await fs.writeFile(indexAbs, result.index, 'utf8');
    const indexRel = path.posix.join(specsDir, 'INDEX.md');
    await execFileP('git', ['add', ...filesRel, indexRel], { cwd });
    // Idempotent saves (same content as HEAD) → no staged diff → skip commit.
    try {
      await execFileP('git', ['diff', '--cached', '--quiet'], { cwd });
      const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
      return stdout.trim();
    } catch {
      // exit 1 → diff present → commit
    }
    await execFileP('git', ['commit', '-m', commitMessage], { cwd });
    const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
    return stdout.trim();
  }

  function stringOrNull(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  }
  function statusOrNull(v: unknown): Status | null {
    return typeof v === 'string' && ALLOWED_STATUSES.has(v as Status) ? (v as Status) : null;
  }

  return {
    async dispatch(req: BackendRequest): Promise<unknown> {
      switch (req.method) {
        case 'listSpecs':       return listSpecs();
        case 'readSpec':        return readSpec(req.args[0] as string);
        case 'readSpecFile':    return readSpecFile(req.args[0] as string, req.args[1] as string);
        case 'validateRepo':    return validateRepoCall();
        case 'listDocs':        return listDocs();
        case 'readDoc':         return readDoc(req.args[0] as string);
        case 'writeDoc':        return writeDoc(req.args[0] as string, req.args[1] as string);
        case 'writeSpecFile':   return writeSpecFile(req.args[0] as string, req.args[1] as string, req.args[2] as string);
        case 'tickTask':        return mutateTask(req.args[0] as string, req.args[1] as number, true);
        case 'untickTask':      return mutateTask(req.args[0] as string, req.args[1] as number, false);
        case 'setStatus':       return setStatus(req.args[0] as string, req.args[1] as Status | null, req.args[2] as string | undefined);
        case 'patchFrontmatter':return patchFrontmatter(req.args[0] as string, req.args[1] as Record<string, unknown>);
        case 'writeHandoff':    return writeHandoff(req.args[0] as string, req.args[1] as string);
        case 'regenerateIndex': return regenerateIndex();
        case 'claimSpec':       return claimSpec(req.args[0] as string, req.args[1] as string | undefined);
        case 'releaseSpec':     return releaseSpec(req.args[0] as string);
        default: throw new Error(`unknown method: ${req.method}`);
      }
    },
  };

  async function listSpecs() {
    const { specsDir, reader } = await getCtx();
    const specs = await loadAllSpecs(reader, specsDir);
    const repoState = { claimedSpecs: new Set<string>(), mergedSpecs: new Set<string>() };
    return specs.map((s) => {
      const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
      const checked = counted.filter((t) => t.checked).length;
      return {
        name: s.name,
        status: deriveStatus(s, repoState),
        progress: `${checked}/${counted.length}`,
        blockedBy: stringOrNull(s.frontmatter.blocked_by),
        frontmatterStatus: statusOrNull(s.frontmatter.status),
        pr: stringOrNull(s.frontmatter.pr),
        branch: stringOrNull(s.frontmatter.branch),
        worktree: stringOrNull(s.frontmatter.worktree),
      };
    });
  }

  async function readSpec(name: string) {
    const { specsDir, reader } = await getCtx();
    const spec = await loadSpec(reader, name, specsDir);
    if (spec.requirements === null && spec.tasks.length === 0 && spec.handoff === null && spec.lenses.size === 0) {
      throw new Error(`no such spec: ${name}`);
    }
    return {
      name: spec.name,
      frontmatter: spec.frontmatter as Record<string, unknown>,
      requirements: spec.requirements,
      tasks: spec.tasks.map((t) => ({ index: t.index, checked: t.checked, text: t.text, tags: [...t.tags] })),
      handoff: spec.handoff,
      lenses: Object.fromEntries(spec.lenses),
    };
  }

  async function readSpecFile(name: string, relpath: string) {
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    const fileAbs = safeJoin(specDir, relpath);
    const content = await fs.readFile(fileAbs, 'utf8');
    return { content };
  }

  async function validateRepoCall() {
    const { specsDir, reader } = await getCtx();
    const errors = await validateRepo(reader, specsDir);
    return { errors };
  }

  async function listDocs() {
    // The reference REST handler walks `docs/`. Replicate the same shape.
    const { cwd } = await getCtx();
    const docsRoot = path.join(cwd, 'docs');
    const out: Array<{ path: string; title: string }> = [];
    async function walk(absDir: string, rel: string): Promise<void> {
      let entries: string[];
      try { entries = await fs.readdir(absDir); }
      catch { return; }
      for (const name of entries) {
        const abs = path.join(absDir, name);
        const r = rel ? `${rel}/${name}` : name;
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) await walk(abs, r);
        else if (name.endsWith('.md')) out.push({ path: `docs/${r}`, title: name.replace(/\.md$/, '') });
      }
    }
    await walk(docsRoot, '');
    return out;
  }

  async function readDoc(p: string) {
    const { cwd } = await getCtx();
    const abs = safeJoin(cwd, p);
    const content = await fs.readFile(abs, 'utf8');
    // Return the raw source — the viewer renders + sanitizes via its shared
    // markdown-editor (which also supports inline editing).
    const title = await firstH1(abs).catch(() => null) ?? path.basename(p, '.md');
    return { source: content, metadata: { title } };
  }

  async function firstH1(file: string): Promise<string | null> {
    const content = await fs.readFile(file, 'utf8');
    const m = content.match(/^#\s+(.+)$/m);
    return m?.[1]?.trim() ?? null;
  }

  async function writeDoc(p: string, content: string) {
    const { cwd } = await getCtx();
    const abs = safeJoin(cwd, p);
    const rel = path.relative(cwd, abs).split(path.sep).join('/');
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, abs);
    await execFileP('git', ['add', rel], { cwd });
    try {
      await execFileP('git', ['diff', '--cached', '--quiet'], { cwd });
      const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
      return { commit: stdout.trim() };
    } catch { /* diff present → commit */ }
    await execFileP('git', ['commit', '-m', `[zg] write-doc: ${rel}`], { cwd });
    const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
    return { commit: stdout.trim() };
  }

  async function writeSpecFile(name: string, relpath: string, content: string) {
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    const fileAbs = safeJoin(specDir, relpath);
    const fileRel = path.relative(cwd, fileAbs).split(path.sep).join('/');
    await fs.mkdir(path.dirname(fileAbs), { recursive: true });
    const tmp = `${fileAbs}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, fileAbs);
    const commit = await regenAndCommit([fileRel], `[zg] write: ${name}/${relpath}`);
    return { commit };
  }

  async function mutateTask(name: string, n: number, checked: boolean) {
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    const tasksAbs = safeJoin(specDir, 'tasks.md');
    const tasksRel = path.relative(cwd, tasksAbs).split(path.sep).join('/');
    const body = await fs.readFile(tasksAbs, 'utf8');
    const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+.*)$/;
    const lines = body.split('\n');
    let count = 0;
    let mutated = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]?.match(TASK_LINE);
      if (!m) continue;
      count++;
      if (count === n) {
        lines[i] = m[1]! + (checked ? 'x' : ' ') + m[3]!;
        mutated = true;
        break;
      }
    }
    if (!mutated) throw new Error(`no task at index ${n}`);
    const tmp = `${tasksAbs}.tmp`;
    await fs.writeFile(tmp, lines.join('\n'), 'utf8');
    await fs.rename(tmp, tasksAbs);
    const commit = await regenAndCommit([tasksRel], `[zg] ${checked ? 'tick' : 'untick'}: ${name}#${n}`);
    return { commit };
  }

  async function setStatus(name: string, status: Status | null, reason: string | undefined) {
    if (status !== null && !ALLOWED_STATUSES.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    const reqAbs = safeJoin(specDir, 'requirements.md');
    const reqRel = path.relative(cwd, reqAbs).split(path.sep).join('/');
    const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
    const parsed = matter(raw, {});
    const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
    if (status === null) {
      delete data.status;
      delete data.blocked_by;
    } else {
      data.status = status;
      if (reason !== undefined) data.blocked_by = reason;
    }
    const newFm = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
    const content = newFm + (parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content);
    const tmp = `${reqAbs}.tmp`;
    await fs.mkdir(path.dirname(reqAbs), { recursive: true });
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, reqAbs);
    const commit = await regenAndCommit([reqRel], `[zg] set-status: ${name}`);
    return { commit };
  }

  async function patchFrontmatter(name: string, patch: Record<string, unknown>) {
    for (const k of Object.keys(patch)) {
      if (PATCH_FORBIDDEN_KEYS.has(k)) {
        throw new Error(`${k} cannot be set via patch_frontmatter; use setStatus instead`);
      }
    }
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    const reqAbs = safeJoin(specDir, 'requirements.md');
    const reqRel = path.relative(cwd, reqAbs).split(path.sep).join('/');
    const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
    const parsed = matter(raw, {});
    const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete data[k];
      else data[k] = v;
    }
    const newFm = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
    const content = newFm + (parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content);
    const tmp = `${reqAbs}.tmp`;
    await fs.mkdir(path.dirname(reqAbs), { recursive: true });
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, reqAbs);
    const commit = await regenAndCommit([reqRel], `[zg] patch-frontmatter: ${name}`);
    return { commit };
  }

  async function writeHandoff(name: string, content: string) {
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    const handoffAbs = safeJoin(specDir, 'handoff.md');
    const handoffRel = path.relative(cwd, handoffAbs).split(path.sep).join('/');
    await fs.mkdir(path.dirname(handoffAbs), { recursive: true });
    const tmp = `${handoffAbs}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, handoffAbs);
    const commit = await regenAndCommit([handoffRel], `[zg] handoff: ${name}`);
    return { commit };
  }

  async function regenerateIndex() {
    const { cwd, specsDir, reader } = await getCtx();
    const result = await runConformance(reader);
    const indexAbs = path.join(cwd, specsDir, 'INDEX.md');
    const existing = await fs.readFile(indexAbs, 'utf8').catch(() => null);
    if (existing === result.index) return { commit: null };
    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    await fs.writeFile(indexAbs, result.index, 'utf8');
    return { commit: null };
  }

  async function claimSpec(name: string, agentId: string | undefined) {
    const { cwd, specsDir } = await getCtx();
    const dir = safeJoin(path.resolve(cwd, specsDir), name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(safeJoin(dir, '.claim'), `${agentId ?? 'vscode'}\n${new Date().toISOString()}\n`, 'utf8');
    return { acknowledged: true as const };
  }

  async function releaseSpec(name: string) {
    const { cwd, specsDir } = await getCtx();
    const specDir = safeJoin(path.resolve(cwd, specsDir), name);
    await fs.unlink(safeJoin(specDir, '.claim')).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
    return { acknowledged: true as const };
  }
}
