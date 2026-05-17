import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  loadAllSpecs, loadSpec, loadConfig, deriveStatus, buildGraph,
  scanClaimedSpecs, parseFrontmatter,
  type Spec, type Status, type Graph,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';

export interface SpecRow {
  name: string;
  status: Status;
  progress: string;
  blockedBy: string | null;
}

export interface SpecDetail {
  name: string;
  frontmatter: Record<string, unknown>;
  requirements: string | null;
  tasks: Array<{ index: number; checked: boolean; text: string; tags: string[] }>;
  handoff: string | null;
  lenses: Record<string, string>;
}

/**
 * In-process backend for the TUI. Reads via @zettelgeist/core directly —
 * no REST round-trips, no separate process. Writes go through the same
 * tmp+rename + git-commit pattern used by the CLI/MCP, so every TUI
 * action produces a real git commit identical to what the REST API or
 * MCP server would emit.
 *
 * Designed for direct unit testing too: the TUI views call backend
 * functions; backend functions don't depend on Ink or React.
 */
export function makeBackend(cwd: string) {
  async function ctx() {
    const reader = makeDiskFsReader(cwd);
    const cfg = await loadConfig(reader);
    return { reader, specsDir: cfg.config.specsDir };
  }

  async function listSpecs(): Promise<SpecRow[]> {
    const { reader, specsDir } = await ctx();
    const specs = await loadAllSpecs(reader, specsDir);
    const claimedSpecs = await scanClaimedSpecs(reader, specsDir);
    const repoState = { claimedSpecs, mergedSpecs: new Set<string>() };
    return specs.map((s) => {
      const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
      const checked = counted.filter((t) => t.checked).length;
      return {
        name: s.name,
        status: deriveStatus(s, repoState),
        progress: `${checked}/${counted.length}`,
        blockedBy: stringOrNull(s.frontmatter.blocked_by),
      };
    });
  }

  async function readDetail(name: string): Promise<SpecDetail | null> {
    const { reader, specsDir } = await ctx();
    const spec = await loadSpec(reader, name, specsDir);
    if (spec.requirements === null && spec.tasks.length === 0 && spec.handoff === null && spec.lenses.size === 0) {
      return null;
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

  async function readGraph(): Promise<Graph> {
    const { reader, specsDir } = await ctx();
    const specs = await loadAllSpecs(reader, specsDir);
    return buildGraph(specs);
  }

  async function listDocs(): Promise<string[]> {
    const docsDir = path.join(cwd, 'docs');
    try {
      const entries = await walkMarkdown(docsDir);
      return entries.map((p) => path.relative(docsDir, p));
    } catch {
      return [];
    }
  }

  async function readDoc(rel: string): Promise<string> {
    return fs.readFile(path.join(cwd, 'docs', rel), 'utf8');
  }

  return { listSpecs, readDetail, readGraph, listDocs, readDoc };
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
    }
  }
  out.sort();
  return out;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

// Suppress unused-warning for the parseFrontmatter import — kept here as
// a convenience re-export for future feature extension.
export { parseFrontmatter };

export type { Spec, Status, Graph };
