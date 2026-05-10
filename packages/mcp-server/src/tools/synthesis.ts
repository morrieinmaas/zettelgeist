import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  loadAllSpecs, loadSpec, deriveStatus, loadConfig,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';
import { safeJoin } from '../util/safe-join.js';

const execFileP = promisify(execFile);

const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('spec'), name: z.string() }),
  z.object({ kind: z.literal('recent'), days: z.number().int().positive() }),
]);

const prepareInput = z.object({ scope: scopeSchema });

interface SynthesisContext {
  markdown_bundle: string;
  derived_state: unknown;
  template_hint: string;
  available_artifacts: string[];
}

const TEMPLATE_HINT = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>{{title}}</title>
<style>body{font-family:system-ui;max-width:780px;margin:2rem auto;padding:0 1rem;line-height:1.6}</style>
</head><body>{{content}}</body></html>`;

export const prepareSynthesisContextTool: ToolDef<z.infer<typeof prepareInput>, SynthesisContext> = {
  name: 'prepare_synthesis_context',
  description: 'Returns shaped context (markdown + derived state + suggested HTML structure) the calling agent uses to write an HTML report. The MCP itself does not call any LLM; the agent does.',
  inputSchema: prepareInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const allSpecs = await loadAllSpecs(reader, cfg.config.specsDir);
    const repoState = { claimedSpecs: new Set<string>(), mergedSpecs: new Set<string>() };

    let specsToInclude = allSpecs;
    if (args.scope.kind === 'spec') {
      const targetName = args.scope.name;
      const target = allSpecs.find((s) => s.name === targetName);
      if (!target) throw new Error(`no such spec: ${targetName}`);
      const deps = (target.frontmatter.depends_on as string[] | undefined) ?? [];
      specsToInclude = allSpecs.filter((s) => s.name === target.name || deps.includes(s.name));
    } else if (args.scope.kind === 'recent') {
      const since = `${args.scope.days}.days.ago`;
      try {
        const { stdout } = await execFileP('git', ['log', `--since=${since}`, '--name-only', '--pretty=format:'], { cwd: ctx.cwd });
        const touchedSpecs = new Set<string>();
        for (const line of stdout.split('\n')) {
          const m = line.match(new RegExp(`^${cfg.config.specsDir}/([^/]+)/`));
          if (m && m[1]) touchedSpecs.add(m[1]);
        }
        specsToInclude = allSpecs.filter((s) => touchedSpecs.has(s.name));
      } catch {
        // fall back to including all if git history unavailable
      }
    }

    // Build markdown bundle
    const sections: string[] = [];
    for (const summary of specsToInclude) {
      const spec = await loadSpec(reader, summary.name, cfg.config.specsDir);
      const status = deriveStatus(spec, repoState);
      sections.push(`## Spec: ${spec.name} (${status})\n`);
      if (spec.requirements) sections.push(`### Requirements\n${spec.requirements}\n`);
      if (spec.tasks.length > 0) {
        sections.push('### Tasks\n' + spec.tasks.map((t) => `- [${t.checked ? 'x' : ' '}] ${t.text}${t.tags.length ? ' ' + t.tags.join(' ') : ''}`).join('\n') + '\n');
      }
      if (spec.handoff) sections.push(`### Handoff\n${spec.handoff}\n`);
    }

    // Derived state
    const derived_state = {
      specs: specsToInclude.map((s) => ({
        name: s.name,
        status: deriveStatus(s, repoState),
        progress: (() => {
          const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
          return `${counted.filter((t) => t.checked).length}/${counted.length}`;
        })(),
        depends_on: (s.frontmatter.depends_on as string[] | undefined) ?? [],
      })),
    };

    // List existing artifacts for cross-reference
    const exportsDir = path.join(ctx.cwd, '.zettelgeist', 'exports');
    let artifacts: string[] = [];
    try {
      const entries = await fs.readdir(exportsDir);
      artifacts = entries.filter((f) => f.endsWith('.html'));
    } catch {
      artifacts = [];
    }

    return {
      markdown_bundle: sections.join('\n'),
      derived_state,
      template_hint: TEMPLATE_HINT,
      available_artifacts: artifacts,
    };
  },
};

const writeArtifactInput = z.object({
  name: z.string(),
  html: z.string(),
  commit: z.boolean().optional(),
});

export const writeArtifactTool: ToolDef<z.infer<typeof writeArtifactInput>, {
  path: string;
  committed: boolean;
  commit_sha: string | null;
}> = {
  name: 'write_artifact',
  description: 'Write an HTML artifact under .zettelgeist/exports/ (gitignored), or commit it under docs/exports/ (default false: write to gitignored exports/).',
  inputSchema: writeArtifactInput,
  async handler(args, ctx) {
    const fileName = args.name.endsWith('.html') ? args.name : `${args.name}.html`;
    const targetDir = args.commit
      ? path.join(ctx.cwd, 'docs', 'exports')
      : path.join(ctx.cwd, '.zettelgeist', 'exports');
    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = safeJoin(targetDir, fileName);
    const tmp = `${targetPath}.tmp`;
    await fs.writeFile(tmp, args.html, 'utf8');
    await fs.rename(tmp, targetPath);

    let commit_sha: string | null = null;
    if (args.commit) {
      const rel = path.relative(ctx.cwd, targetPath).split(path.sep).join('/');
      await execFileP('git', ['add', rel], { cwd: ctx.cwd });
      await execFileP('git', ['commit', '-m', `[zg] artifact: ${args.name}`], { cwd: ctx.cwd });
      const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: ctx.cwd });
      commit_sha = stdout.trim();
    }

    return {
      path: path.relative(ctx.cwd, targetPath).split(path.sep).join('/'),
      committed: !!args.commit,
      commit_sha,
    };
  },
};
