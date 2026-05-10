import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeFileAndCommit } from '../util/write-and-commit.js';
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
    const fileRel = path.posix.join(cfg.config.specsDir, args.name, args.relpath);
    return writeFileAndCommit(ctx.cwd, fileRel, args.content, `[zg] write: ${args.name}/${args.relpath}`);
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
    const fileRel = path.posix.join(cfg.config.specsDir, args.name, 'handoff.md');
    return writeFileAndCommit(ctx.cwd, fileRel, args.content, `[zg] handoff: ${args.name}`);
  },
};

const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+.*)$/;

async function tickOrUntick(cwd: string, name: string, n: number, checked: boolean): Promise<{ commit: string }> {
  const reader = makeDiskFsReader(cwd);
  const cfg = await loadConfig(reader);
  const tasksRel = path.posix.join(cfg.config.specsDir, name, 'tasks.md');
  const tasksAbs = path.join(cwd, tasksRel);
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
  const op = checked ? 'tick' : 'untick';
  return writeFileAndCommit(cwd, tasksRel, lines.join('\n'), `[zg] ${op}: ${name}#${n}`);
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
  status: z.enum(['blocked', 'cancelled']).nullable(),
  reason: z.string().optional(),
});

export const setStatusTool: ToolDef<z.infer<typeof setStatusInput>, { commit: string }> = {
  name: 'set_status',
  description: 'Set the status frontmatter override on a spec (blocked/cancelled), or clear it (null).',
  inputSchema: setStatusInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const reqRel = path.posix.join(cfg.config.specsDir, args.name, 'requirements.md');
    const reqAbs = path.join(ctx.cwd, reqRel);
    const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
    const parsed = matter(raw, {});
    const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;
    if (args.status === null) {
      delete data.status;
      delete data.blocked_by;
    } else {
      data.status = args.status;
      if (args.reason !== undefined) data.blocked_by = args.reason;
    }
    const newFm = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
    const newContent = newFm + (parsed.content.startsWith('\n') ? parsed.content.slice(1) : parsed.content);
    return writeFileAndCommit(ctx.cwd, reqRel, newContent, `[zg] set-status: ${args.name}`);
  },
};
