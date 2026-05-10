import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { installHookCommand } from '../src/commands/install-hook.js';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-hook-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('installHookCommand', () => {
  it('writes a fresh hook in a clean repo', async () => {
    const r = await installHookCommand({ path: tmp, force: false });
    expect(r.ok).toBe(true);
    const hook = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(hook).toContain('# >>> zettelgeist >>>');
  });

  it('idempotent on re-run', async () => {
    await installHookCommand({ path: tmp, force: false });
    const first = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    await installHookCommand({ path: tmp, force: false });
    const second = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(second).toBe(first);
  });

  it('rejects when non-marker hook exists, no --force', async () => {
    await fs.mkdir(path.join(tmp, '.git', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'echo "user hook"\n');
    const r = await installHookCommand({ path: tmp, force: false });
    expect(r.ok).toBe(false);
  });

  it('--force backs up the conflicting hook and replaces', async () => {
    await fs.mkdir(path.join(tmp, '.git', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'echo "user hook"\n');
    const r = await installHookCommand({ path: tmp, force: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.backup).toBeDefined();
    const backup = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit.before-zettelgeist'), 'utf8');
    expect(backup).toBe('echo "user hook"\n');
  });

  it('sets executable bit', async () => {
    await installHookCommand({ path: tmp, force: false });
    const stat = await fs.stat(path.join(tmp, '.git', 'hooks', 'pre-commit'));
    expect(stat.mode & 0o100).toBe(0o100);
  });
});
