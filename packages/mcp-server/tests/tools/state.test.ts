import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  claimSpecTool, releaseSpecTool, regenerateIndexTool, installGitHookTool,
} from '../../src/tools/state.js';
import { tickTaskTool } from '../../src/tools/write.js';
import { parseLogCycles } from '@zettelgeist/core';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-state-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('stateTools', () => {
  it('claim_spec writes a per-actor .claim-<slug> file', async () => {
    const result = await claimSpecTool.handler({ name: 'foo', agent_id: 'agent-x' }, { cwd: tmp });
    expect(result).toEqual({ acknowledged: true, agent_id: 'agent-x' });
    const content = await fs.readFile(path.join(tmp, 'specs', 'foo', '.claim-agent-x'), 'utf8');
    expect(content).toContain('agent-x');
  });

  it('two agents claiming the same spec produce two distinct files', async () => {
    await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
    await claimSpecTool.handler({ name: 'foo', agent_id: 'bob' }, { cwd: tmp });
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-alice'));
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-bob'));
  });

  it('release_spec removes only the calling agent file; idempotent reports removed:false', async () => {
    await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
    await claimSpecTool.handler({ name: 'foo', agent_id: 'bob' }, { cwd: tmp });
    const r1 = await releaseSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
    expect(r1).toEqual({ acknowledged: true, removed: true });
    await expect(fs.stat(path.join(tmp, 'specs', 'foo', '.claim-alice'))).rejects.toThrow();
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-bob'));   // untouched
    // Second release of the same agent_id: nothing to remove → removed:false.
    // (The MCP caller can use this signal to detect agent_id drift mid-session.)
    const r2 = await releaseSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
    expect(r2).toEqual({ acknowledged: true, removed: false });
  });

  it('release_spec with no agent_id falls back to legacy .claim if present', async () => {
    // Simulate a legacy v0.1 claim. release_spec without agent_id synthesizes a
    // USER-pid default; that .claim-<slug> won't exist, so the handler falls
    // back to removing `.claim`.
    await fs.writeFile(path.join(tmp, 'specs', 'foo', '.claim'), 'old\n', 'utf8');
    const r = await releaseSpecTool.handler({ name: 'foo' }, { cwd: tmp });
    expect(r).toEqual({ acknowledged: true, removed: true });
    await expect(fs.stat(path.join(tmp, 'specs', 'foo', '.claim'))).rejects.toThrow();
  });

  it('claim_spec returns the sanitized slug; release uses it to round-trip', async () => {
    const r1 = await claimSpecTool.handler({ name: 'foo', agent_id: 'alice@laptop.local' }, { cwd: tmp });
    expect(r1.agent_id).toBe('alice-laptop.local'); // @ sanitized to -
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-alice-laptop.local'));
    // Release with the slug returned by claim_spec must remove the file.
    const r2 = await releaseSpecTool.handler({ name: 'foo', agent_id: r1.agent_id }, { cwd: tmp });
    expect(r2.removed).toBe(true);
  });

  it('claim_spec migrates: removes any pre-existing legacy .claim on claim', async () => {
    // v0.1 repo: legacy `.claim` already on disk.
    await fs.writeFile(path.join(tmp, 'specs', 'foo', '.claim'), 'old\n', 'utf8');
    await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
    // After the per-actor claim, the legacy `.claim` must be gone — otherwise
    // the spec stays "claimed" even after every per-actor release.
    await expect(fs.stat(path.join(tmp, 'specs', 'foo', '.claim'))).rejects.toThrow();
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-alice'));
  });

  it('regenerate_index returns null when INDEX.md is already current', async () => {
    // First run: writes INDEX.md and commits
    const first = await regenerateIndexTool.handler({}, { cwd: tmp });
    expect(first.commit).toMatch(/^[0-9a-f]{40}$/);
    // Second run: nothing to do
    const second = await regenerateIndexTool.handler({}, { cwd: tmp });
    expect(second.commit).toBeNull();
  });

  it('install_git_hook writes the marker block', async () => {
    const result = await installGitHookTool.handler({}, { cwd: tmp });
    expect(result).toEqual({ acknowledged: true });
    const hook = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(hook).toContain('# >>> zettelgeist >>>');
    expect(hook).toContain('# <<< zettelgeist <<<');
  });

  // v0.3 — per-spec .log.md OTA trace.
  describe('.log.md cycle writes (v0.3)', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tmp, 'specs', 'foo', 'tasks.md'),
        '- [ ] one\n- [ ] two\n',
      );
      await execFileP('git', ['add', '.'], { cwd: tmp });
      await execFileP('git', ['commit', '-q', '-m', 'add tasks'], { cwd: tmp });
    });

    it('claim_spec opens a cycle (## ⊢ ... claim) in .log.md and commits it', async () => {
      await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
      const log = await fs.readFile(path.join(tmp, 'specs', 'foo', '.log.md'), 'utf8');
      const parsed = parseLogCycles(log);
      expect(parsed.cycles).toHaveLength(1);
      expect(parsed.cycles[0]!.open.agentId).toBe('alice');
      expect(parsed.cycles[0]!.close).toBeNull();
    });

    it('tick_task during an open cycle appends an action entry', async () => {
      await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
      await tickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
      const log = await fs.readFile(path.join(tmp, 'specs', 'foo', '.log.md'), 'utf8');
      const parsed = parseLogCycles(log);
      expect(parsed.cycles).toHaveLength(1);
      const actions = parsed.cycles[0]!.entries.filter((e) => e.kind === 'action');
      expect(actions).toHaveLength(1);
      expect((actions[0] as { action: string }).action).toBe('tick_task(1)');
    });

    it('release_spec closes the cycle with a sha pointing at the prior commit', async () => {
      await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
      await tickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
      // Capture the sha of the tick commit — that's what release should record.
      const tickSha = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: tmp })).stdout.trim();
      await releaseSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
      const log = await fs.readFile(path.join(tmp, 'specs', 'foo', '.log.md'), 'utf8');
      const parsed = parseLogCycles(log);
      expect(parsed.cycles).toHaveLength(1);
      expect(parsed.cycles[0]!.close).not.toBeNull();
      expect(parsed.cycles[0]!.close?.agentId).toBe('alice');
      expect(parsed.cycles[0]!.close?.sha).toBe(tickSha);
    });

    it('a full claim → tick → tick → release cycle produces a complete, well-formed entry', async () => {
      await claimSpecTool.handler({ name: 'foo', agent_id: 'morrie' }, { cwd: tmp });
      await tickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
      await tickTaskTool.handler({ name: 'foo', n: 2 }, { cwd: tmp });
      await releaseSpecTool.handler({ name: 'foo', agent_id: 'morrie' }, { cwd: tmp });
      const log = await fs.readFile(path.join(tmp, 'specs', 'foo', '.log.md'), 'utf8');
      const parsed = parseLogCycles(log);
      expect(parsed.cycles).toHaveLength(1);
      const cycle = parsed.cycles[0]!;
      expect(cycle.open.agentId).toBe('morrie');
      expect(cycle.close).not.toBeNull();
      const actions = cycle.entries
        .filter((e) => e.kind === 'action')
        .map((e) => (e as { action: string }).action);
      expect(actions).toEqual(['tick_task(1)', 'tick_task(2)']);
    });

    it('does NOT include .log.md in the spec\'s state derivation (walker ignores it)', async () => {
      await claimSpecTool.handler({ name: 'foo', agent_id: 'alice' }, { cwd: tmp });
      await tickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
      // Read the spec via list_specs — the log.md must not pollute progress.
      const { listSpecsTool } = await import('../../src/tools/read.js');
      const specs = await listSpecsTool.handler({}, { cwd: tmp });
      const foo = specs.find((s) => s.name === 'foo')!;
      // Two tasks, one ticked. .log.md must NOT contribute fake tasks.
      expect(foo.progress).toBe('1/2');
    });
  });
});
