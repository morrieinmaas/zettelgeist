import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  claimSpecTool, releaseSpecTool, regenerateIndexTool, installGitHookTool,
} from '../../src/tools/state.js';

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
});
