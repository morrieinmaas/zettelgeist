import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  loadAllSpecs, loadSpec, deriveStatus, loadConfig, validateRepo,
  scanClaimedSpecs,
  type Status, type ValidationError,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';
import { safeJoin } from '../util/safe-join.js';

const emptyInput = z.object({});

export const listSpecsTool: ToolDef<Record<string, never>, Array<{
  name: string; status: Status; progress: string; blockedBy: string | null;
  frontmatterStatus: Status | null;
  pr: string | null; branch: string | null; worktree: string | null;
}>> = {
  name: 'list_specs',
  description: 'List all specs in the repo with derived status, progress, blockedBy, the explicit `status:` override (frontmatterStatus, or null if derived), and any linked PR/branch/worktree from frontmatter.',
  inputSchema: emptyInput,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specs = await loadAllSpecs(reader, cfg.config.specsDir);
    const claimedSpecs = await scanClaimedSpecs(reader, cfg.config.specsDir);
    const repoState = { claimedSpecs, mergedSpecs: new Set<string>() };
    return specs.map((s) => ({
      name: s.name,
      status: deriveStatus(s, repoState),
      progress: `${s.tasks.filter((t) => !t.tags.includes('#skip') && t.checked).length}/${s.tasks.filter((t) => !t.tags.includes('#skip')).length}`,
      blockedBy: stringOrNull(s.frontmatter.blocked_by),
      frontmatterStatus: statusOrNull(s.frontmatter.status),
      pr: stringOrNull(s.frontmatter.pr),
      branch: stringOrNull(s.frontmatter.branch),
      worktree: stringOrNull(s.frontmatter.worktree),
    }));
  },
};

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

const VALID_STATUSES = new Set<Status>([
  'draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled',
]);
function statusOrNull(v: unknown): Status | null {
  return typeof v === 'string' && VALID_STATUSES.has(v as Status) ? (v as Status) : null;
}

const readSpecInput = z.object({ name: z.string() });

export const readSpecTool: ToolDef<{ name: string }, {
  name: string;
  frontmatter: Record<string, unknown>;
  requirements: string | null;
  tasks: Array<{ index: number; checked: boolean; text: string; tags: string[] }>;
  handoff: string | null;
  lenses: Record<string, string>;
}> = {
  name: 'read_spec',
  description: 'Read a spec by name; returns frontmatter, requirements, tasks, handoff, lenses.',
  inputSchema: readSpecInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const spec = await loadSpec(reader, args.name, cfg.config.specsDir);
    if (spec.requirements === null && spec.tasks.length === 0 && spec.handoff === null && spec.lenses.size === 0) {
      throw new Error(`no such spec: ${args.name}`);
    }
    return {
      name: spec.name,
      frontmatter: spec.frontmatter as Record<string, unknown>,
      requirements: spec.requirements,
      tasks: spec.tasks.map((t) => ({ index: t.index, checked: t.checked, text: t.text, tags: [...t.tags] })),
      handoff: spec.handoff,
      lenses: Object.fromEntries(spec.lenses),
    };
  },
};

const readSpecFileInput = z.object({ name: z.string(), relpath: z.string() });

export const readSpecFileTool: ToolDef<{ name: string; relpath: string }, { content: string }> = {
  name: 'read_spec_file',
  description: 'Read a single file inside a spec by relative path (e.g. tasks.md, lenses/design.md).',
  inputSchema: readSpecFileInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const filepath = safeJoin(specDir, args.relpath);
    const content = await fs.readFile(filepath, 'utf8');
    return { content };
  },
};

export const validateRepoTool: ToolDef<Record<string, never>, { errors: ValidationError[] }> = {
  name: 'validate_repo',
  description: 'Run validateRepo and return validation errors (E_CYCLE, E_INVALID_FRONTMATTER, E_EMPTY_SPEC).',
  inputSchema: emptyInput,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const validation = await validateRepo(reader, cfg.config.specsDir);
    return { errors: [...cfg.errors, ...validation.errors] };
  },
};
