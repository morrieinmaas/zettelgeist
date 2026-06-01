import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeFileAndCommit } from '../util/write-and-commit.js';
import { safeJoin } from '../util/safe-join.js';
import type { ToolDef } from '../server.js';

const writeSpecFileInput = z.object({
  name: z.string(),
  relpath: z.string(),
  content: z.string(),
});

export const writeSpecFileTool: ToolDef<z.infer<typeof writeSpecFileInput>, { commit: string }> = {
  name: 'write_spec_file',
  description: 'Write a file inside a spec, regenerate INDEX.md, and commit.',
  inputSchema: writeSpecFileInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const fileAbs = safeJoin(specDir, args.relpath);
    const fileRel = path.relative(ctx.cwd, fileAbs).split(path.sep).join('/');
    return writeFileAndCommit(
      ctx.cwd,
      fileRel,
      args.content,
      `[zg] write: ${args.name}/${args.relpath}`,
      { log: { specName: args.name, action: `write_file(${args.relpath})` } },
    );
  },
};

const writeHandoffInput = z.object({ name: z.string(), content: z.string() });

export const writeHandoffTool: ToolDef<z.infer<typeof writeHandoffInput>, { commit: string }> = {
  name: 'write_handoff',
  description: 'Write the handoff.md for a spec and commit.',
  inputSchema: writeHandoffInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const fileAbs = safeJoin(specDir, 'handoff.md');
    const fileRel = path.relative(ctx.cwd, fileAbs).split(path.sep).join('/');
    return writeFileAndCommit(
      ctx.cwd,
      fileRel,
      args.content,
      `[zg] handoff: ${args.name}`,
      { log: { specName: args.name, action: 'write_handoff()' } },
    );
  },
};

const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+.*)$/;

/**
 * Compute the new contents of `requirements.md` with a `status: draft`
 * frontmatter override stripped, without touching the disk. Returns
 * `null` when there is nothing to clear (no requirements.md, no
 * frontmatter, status not draft, or status is one of the user-
 * intentional values). The caller stages the returned write through
 * `writeFileAndCommit`'s `extraWrites` so the actual fs mutation
 * happens atomically alongside the tasks.md tick.
 *
 * Rationale: `draft` is uniquely the "no work yet" state. A `tick_task`
 * is unambiguous evidence that work has started, so a pinned `draft`
 * override (typically written by the board's "+" button) is provably
 * wrong and would otherwise mask all forward progress. Other override
 * values (`planned`, `in-progress`, `in-review`, `done`, `blocked`,
 * `cancelled`) may reflect explicit user intent — we leave those alone.
 */
async function plannedDraftOverrideClear(
  cwd: string,
  specDir: string,
): Promise<{ relPath: string; content: string } | null> {
  const reqAbs = safeJoin(specDir, 'requirements.md');
  let raw: string;
  try {
    raw = await fs.readFile(reqAbs, 'utf8');
  } catch {
    return null;
  }
  const parsed = matter(raw, {});
  const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
  if (data.status !== 'draft') return null;
  delete data.status;
  const newFm = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
  const body = parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content;
  const newContent = newFm + body;
  const relPath = path.relative(cwd, reqAbs).split(path.sep).join('/');
  return { relPath, content: newContent };
}

async function tickOrUntick(cwd: string, name: string, n: number, checked: boolean): Promise<{ commit: string }> {
  const reader = makeDiskFsReader(cwd);
  const cfg = await loadConfig(reader);
  const specsRoot = path.resolve(cwd, cfg.config.specsDir);
  const specDir = safeJoin(specsRoot, name);
  const tasksAbs = safeJoin(specDir, 'tasks.md');
  const tasksRel = path.relative(cwd, tasksAbs).split(path.sep).join('/');
  const body = await fs.readFile(tasksAbs, 'utf8');
  const lines = body.split('\n');
  let count = 0;
  let mutated = false;
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
  if (!mutated) throw new Error(`no task at index ${n} in ${name}`);

  // Tick (only) clears a stale `status: draft` override on requirements.md
  // so the board doesn't keep the card pinned in the draft column after
  // the user has started working. Untick intentionally does NOT clear —
  // an untick might be undoing an accidental tick on a draft spec, and
  // re-pinning to draft would be the right move there.
  const extraWrites: Array<{ relPath: string; content: string }> = [];
  if (checked) {
    const cleared = await plannedDraftOverrideClear(cwd, specDir);
    if (cleared) extraWrites.push(cleared);
  }

  const op = checked ? 'tick' : 'untick';
  const opts: {
    log: { specName: string; action: string };
    extraWrites?: ReadonlyArray<{ relPath: string; content: string }>;
  } = {
    log: { specName: name, action: `${op}_task(${n})` },
  };
  if (extraWrites.length > 0) opts.extraWrites = extraWrites;
  return writeFileAndCommit(
    cwd,
    tasksRel,
    lines.join('\n'),
    `[zg] ${op}: ${name}#${n}`,
    opts,
  );
}

const tickTaskInput = z.object({ name: z.string(), n: z.number().int().positive() });

export const tickTaskTool: ToolDef<z.infer<typeof tickTaskInput>, { commit: string }> = {
  name: 'tick_task',
  description: "Tick the task at the given index in the spec's tasks.md.",
  inputSchema: tickTaskInput,
  async handler(args, ctx) { return tickOrUntick(ctx.cwd, args.name, args.n, true); },
};

export const untickTaskTool: ToolDef<z.infer<typeof tickTaskInput>, { commit: string }> = {
  name: 'untick_task',
  description: "Untick the task at the given index in the spec's tasks.md.",
  inputSchema: tickTaskInput,
  async handler(args, ctx) { return tickOrUntick(ctx.cwd, args.name, args.n, false); },
};

const setStatusInput = z.object({
  name: z.string(),
  status: z.enum([
    'draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled',
  ]).nullable(),
  reason: z.string().optional(),
});

const patchFrontmatterInput = z.object({
  name: z.string(),
  patch: z.record(z.unknown()),
});

const PATCH_FORBIDDEN_KEYS = new Set(['status', 'blocked_by']);

export const patchFrontmatterTool: ToolDef<z.infer<typeof patchFrontmatterInput>, { commit: string }> = {
  name: 'patch_frontmatter',
  description: 'Merge a frontmatter patch into a spec\'s requirements.md. Keys with value `null` are deleted; everything else is set. `status` and `blocked_by` are forbidden — use set_status instead.',
  inputSchema: patchFrontmatterInput,
  async handler(args, ctx) {
    for (const k of Object.keys(args.patch)) {
      if (PATCH_FORBIDDEN_KEYS.has(k)) {
        throw new Error(`${k} cannot be set via patch_frontmatter; use set_status instead`);
      }
    }
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const reqAbs = safeJoin(specDir, 'requirements.md');
    const reqRel = path.relative(ctx.cwd, reqAbs).split(path.sep).join('/');
    const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
    const parsed = matter(raw, {});
    const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(args.patch)) {
      if (v === null) delete data[k];
      else data[k] = v;
    }
    const newFm = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
    const newContent = newFm + (parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content);
    const patchKeys = Object.keys(args.patch).join(',');
    return writeFileAndCommit(
      ctx.cwd,
      reqRel,
      newContent,
      `[zg] patch-frontmatter: ${args.name}`,
      { log: { specName: args.name, action: `patch_frontmatter(${patchKeys})` } },
    );
  },
};

export const setStatusTool: ToolDef<z.infer<typeof setStatusInput>, { commit: string }> = {
  name: 'set_status',
  description: 'Set the status frontmatter override on a spec (any of draft/planned/in-progress/in-review/done/blocked/cancelled), or clear it (null) to fall back to derived status. `reason` is recorded in `blocked_by` and is required for `blocked`.',
  inputSchema: setStatusInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const reqAbs = safeJoin(specDir, 'requirements.md');
    const reqRel = path.relative(ctx.cwd, reqAbs).split(path.sep).join('/');
    const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
    const parsed = matter(raw, {});
    const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
    const prevStatus = (data.status as string | undefined) ?? '(derived)';
    if (args.status === null) {
      delete data.status;
      delete data.blocked_by;
    } else {
      data.status = args.status;
      if (args.reason !== undefined) data.blocked_by = args.reason;
    }
    const newFm = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
    const newContent = newFm + (parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content);
    const nextStatus = args.status === null ? '(cleared)' : args.status;
    return writeFileAndCommit(
      ctx.cwd,
      reqRel,
      newContent,
      `[zg] set-status: ${args.name}`,
      { log: { specName: args.name, action: `set_status(${prevStatus} → ${nextStatus})` } },
    );
  },
};
