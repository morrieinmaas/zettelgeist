import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, '..', 'dist', 'bin.js');

const COMMANDS = ['regen', 'validate', 'install-hook', 'serve', 'export-doc'];

const skip = !existsSync(BIN);
const describeFn = skip ? describe.skip : describe;

describeFn('--help per command', () => {
  for (const cmd of COMMANDS) {
    it(`zettelgeist ${cmd} --help prints command-specific help and exits 0`, async () => {
      const { stdout } = await execFileP('node', [BIN, cmd, '--help']);
      // Per-command help mentions the command name in its usage line
      expect(stdout).toContain(`zettelgeist ${cmd}`);
      // It must not be the global help — the global help has a Commands: section
      expect(stdout).not.toContain('Commands:');
    });
  }

  it('zettelgeist nonsense --help prints global help and exits non-zero', async () => {
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
      const r = await execFileP('node', [BIN, 'nonsense', '--help']);
      stdout = r.stdout;
      stderr = r.stderr;
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      exitCode = e.code ?? 1;
      stdout = e.stdout ?? '';
      stderr = e.stderr ?? '';
    }
    expect(exitCode).not.toBe(0);
    const errorOut = stdout + stderr;
    expect(errorOut).toContain('unknown command');
    expect(errorOut).toContain('Commands:');
  });

  it('zettelgeist (no args) prints global help and exits 0', async () => {
    const { stdout } = await execFileP('node', [BIN]);
    expect(stdout).toContain('Commands:');
  });
});
