import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';
import { safeJoin } from '../util/safe-join.js';

const execFileP = promisify(execFile);

const claimInput = z.object({ name: z.string(), agent_id: z.string().optional() });

export const claimSpecTool: ToolDef<z.infer<typeof claimInput>, { acknowledged: true }> = {
  name: 'claim_spec',
  description: 'Write a .claim file for a spec (ephemeral, gitignored).',
  inputSchema: claimInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const dir = safeJoin(specsRoot, args.name);
    await fs.mkdir(dir, { recursive: true });
    const agentId = args.agent_id ?? 'agent';
    const ts = new Date().toISOString();
    await fs.writeFile(safeJoin(dir, '.claim'), `${agentId}\n${ts}\n`, 'utf8');
    return { acknowledged: true };
  },
};

const releaseInput = z.object({ name: z.string() });

export const releaseSpecTool: ToolDef<z.infer<typeof releaseInput>, { acknowledged: true }> = {
  name: 'release_spec',
  description: 'Remove the .claim file for a spec.',
  inputSchema: releaseInput,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specsRoot = path.resolve(ctx.cwd, cfg.config.specsDir);
    const specDir = safeJoin(specsRoot, args.name);
    const claimPath = safeJoin(specDir, '.claim');
    await fs.unlink(claimPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
    return { acknowledged: true };
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

const HOOK_BLOCK = '# >>> zettelgeist >>>\nzettelgeist regen --check\n# <<< zettelgeist <<<';

const installHookInput = z.object({ force: z.boolean().optional() });

export const installGitHookTool: ToolDef<z.infer<typeof installHookInput>, { acknowledged: true }> = {
  name: 'install_git_hook',
  description: 'Install the pre-commit hook (smart-merge with markers).',
  inputSchema: installHookInput,
  async handler(args, ctx) {
    const { stdout } = await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: ctx.cwd });
    const repoRoot = stdout.trim();
    const hookDir = path.join(repoRoot, '.git', 'hooks');
    await fs.mkdir(hookDir, { recursive: true });
    const hookPath = path.join(hookDir, 'pre-commit');
    let existing: string | null = null;
    try {
      existing = await fs.readFile(hookPath, 'utf8');
    } catch {
      existing = null;
    }
    if (existing === null || existing.trim() === '') {
      await fs.writeFile(hookPath, HOOK_BLOCK + '\n', 'utf8');
    } else if (existing.includes('# >>> zettelgeist >>>') && existing.includes('# <<< zettelgeist <<<')) {
      // already installed; idempotent — no-op
    } else if (args.force) {
      await fs.writeFile(`${hookPath}.before-zettelgeist`, existing, 'utf8');
      await fs.writeFile(hookPath, HOOK_BLOCK + '\n', 'utf8');
    } else {
      throw new Error('pre-commit hook contains non-marker content; pass force: true to overwrite');
    }
    await fs.chmod(hookPath, 0o755);
    return { acknowledged: true };
  },
};
