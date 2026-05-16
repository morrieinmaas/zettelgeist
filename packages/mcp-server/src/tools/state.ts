import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig, sanitizeAgentId, defaultAgentId } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { installPreCommitHook } from '@zettelgeist/git-hook';
import type { ToolDef } from '../server.js';
import { safeJoin } from '../util/safe-join.js';

const execFileP = promisify(execFile);

const claimInput = z.object({ name: z.string(), agent_id: z.string().optional() });

export const claimSpecTool: ToolDef<z.infer<typeof claimInput>, { acknowledged: true; agent_id: string }> = {
  name: 'claim_spec',
  description:
    'Write a per-actor .claim-<agent_id> file for a spec (ephemeral, gitignored). Multiple actors can claim the same spec concurrently from different machines without git conflicts.',
  inputSchema: claimInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const dir = safeJoin(specsRoot, args.name);
    await fs.mkdir(dir, { recursive: true });
    // No agent_id → synthesize USER-pid so two anonymous claimers don't
    // collide on a constant slug. Pass the slug back so the caller can
    // round-trip it on `release_spec`.
    const agentSlug = args.agent_id ? sanitizeAgentId(args.agent_id) : defaultAgentId();
    const ts = new Date().toISOString();
    await fs.writeFile(
      safeJoin(dir, `.claim-${agentSlug}`),
      `${args.agent_id ?? agentSlug}\n${ts}\n`,
      'utf8',
    );
    // Migration: drop any legacy single `.claim` left over from v0.1 so the
    // spec doesn't stay stuck as "claimed" after the per-actor releases run.
    await fs.unlink(safeJoin(dir, '.claim')).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
    return { acknowledged: true, agent_id: agentSlug };
  },
};

const releaseInput = z.object({ name: z.string(), agent_id: z.string().optional() });

export const releaseSpecTool: ToolDef<z.infer<typeof releaseInput>, { acknowledged: true; removed: boolean }> = {
  name: 'release_spec',
  description:
    'Remove the caller\'s per-actor .claim-<agent_id> file. Other actors\' claims on the same spec are preserved. When no agent_id is provided AND no per-actor file matches the synthesized default, falls back to removing the legacy single `.claim` file. Returns {removed: false} if nothing was unlinked — useful for diagnosing agent_id drift.',
  inputSchema: releaseInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const agentSlug = args.agent_id ? sanitizeAgentId(args.agent_id) : defaultAgentId();
    const claimPath = safeJoin(specDir, `.claim-${agentSlug}`);
    let removed = false;
    await fs.unlink(claimPath).then(() => { removed = true; }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (!removed && !args.agent_id) {
      const legacy = safeJoin(specDir, '.claim');
      await fs.unlink(legacy).then(() => { removed = true; }).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    return { acknowledged: true, removed };
  },
};

const emptyInput = z.object({});

export const regenerateIndexTool: ToolDef<Record<string, never>, { commit: string | null }> = {
  name: 'regenerate_index',
  description: 'Regenerate INDEX.md and commit if there is a change. Returns null commit if no change.',
  inputSchema: emptyInput,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const result = await runConformance(reader);
    const indexAbs = path.join(ctx.cwd, cfg.config.specsDir, 'INDEX.md');
    let onDisk: string | null = null;
    try {
      onDisk = await fs.readFile(indexAbs, 'utf8');
    } catch {
      onDisk = null;
    }
    if (onDisk === result.index) return { commit: null };

    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    const tmp = `${indexAbs}.tmp`;
    await fs.writeFile(tmp, result.index, 'utf8');
    await fs.rename(tmp, indexAbs);

    const indexRel = path.posix.join(cfg.config.specsDir, 'INDEX.md');
    await execFileP('git', ['add', indexRel], { cwd: ctx.cwd });
    await execFileP('git', ['commit', '-m', '[zg] regen'], { cwd: ctx.cwd });
    const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: ctx.cwd });
    return { commit: stdout.trim() };
  },
};

const installHookInput = z.object({ force: z.boolean().optional() });

export const installGitHookTool: ToolDef<z.infer<typeof installHookInput>, { acknowledged: true }> = {
  name: 'install_git_hook',
  description: 'Install the pre-commit hook (smart-merge with markers).',
  inputSchema: installHookInput,
  async handler(args, ctx) {
    const { stdout } = await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: ctx.cwd });
    const repoRoot = stdout.trim();
    await installPreCommitHook(repoRoot, args.force !== undefined ? { force: args.force } : {});
    return { acknowledged: true };
  },
};
