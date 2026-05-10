import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  loadAllSpecs, loadSpec, deriveStatus, loadConfig, validateRepo,
  type Status, type ValidationError,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const emptyInput = z.object({});

export const listSpecsTool: ToolDef<Record<string, never>, Array<{
  name: string; status: Status; progress: string; blockedBy: string | null;
}>> = {
  name: 'list_specs',
  description: 'List all specs in the repo with derived status, progress, and blockedBy.',
  inputSchema: emptyInput,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specs = await loadAllSpecs(reader, cfg.config.specsDir);
    const repoState = { claimedSpecs: new Set<string>(), mergedSpecs: new Set<string>() };
    return specs.map((s) => {
      const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
      const checked = counted.filter((t) => t.checked).length;
      const blockedBy = typeof s.frontmatter.blocked_by === 'string' && s.frontmatter.blocked_by.trim() !== ''
        ? s.frontmatter.blocked_by.trim()
        : null;
      return { name: s.name, status: deriveStatus(s, repoState), progress: `${checked}/${counted.length}`, blockedBy };
    });
  },
};

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
    const filepath = path.join(ctx.cwd, cfg.config.specsDir, args.name, args.relpath);
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
