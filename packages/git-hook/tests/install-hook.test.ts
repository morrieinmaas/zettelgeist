import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  HOOK_BLOCK,
  HOOK_MARKER_BEGIN,
  HOOK_MARKER_END,
  installPreCommitHook,
  mergeHookContent,
} from '../src/install-hook.js';

describe('mergeHookContent', () => {
  it('returns the marker block alone when input is null or empty', () => {
    expect(mergeHookContent(null)).toBe(HOOK_BLOCK + '\n');
    expect(mergeHookContent('')).toBe(HOOK_BLOCK + '\n');
  });

  it('replaces an existing marker block idempotently', () => {
    const existing =
      'echo "before"\n' +
      HOOK_BLOCK + '\n' +
      'echo "after"\n';
    const result = mergeHookContent(existing);
    expect(result).toBe(
      'echo "before"\n' +
      HOOK_BLOCK + '\n' +
      'echo "after"\n',
    );
    expect(mergeHookContent(result)).toBe(result);
  });

  it('throws when existing content has non-marker hooks', () => {
    expect(() => mergeHookContent('echo "user hook"\n')).toThrow(/non-marker/i);
  });

  it('appends marker block to a file with only a shebang', () => {
    const existing = '#!/usr/bin/env sh\n';
    const result = mergeHookContent(existing);
    expect(result).toBe(existing + HOOK_BLOCK + '\n');
  });

  it('HOOK_BLOCK contains both markers and the PATH-aware fallback', () => {
    expect(HOOK_BLOCK).toContain(HOOK_MARKER_BEGIN);
    expect(HOOK_BLOCK).toContain(HOOK_MARKER_END);
    expect(HOOK_BLOCK).toContain('command -v zettelgeist');
    expect(HOOK_BLOCK).toContain('./node_modules/.bin/zettelgeist');
  });
});

describe('installPreCommitHook', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-git-hook-'));
    await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('writes the hook file with the executable bit set', async () => {
    const result = await installPreCommitHook(tmp);
    expect(result).toEqual({ installed: true });
    const hookPath = path.join(tmp, '.git', 'hooks', 'pre-commit');
    const content = await fs.readFile(hookPath, 'utf8');
    expect(content).toBe(HOOK_BLOCK + '\n');
    const stat = await fs.stat(hookPath);
    // executable for owner
    expect(stat.mode & 0o100).toBe(0o100);
  });

  it('with force=true on pre-existing non-marker content writes a backup', async () => {
    const hookPath = path.join(tmp, '.git', 'hooks', 'pre-commit');
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(hookPath, '#!/bin/sh\necho "user hook"\n', 'utf8');

    const result = await installPreCommitHook(tmp, { force: true });
    expect(result.installed).toBe(true);
    expect(result.backup).toBe(`${hookPath}.before-zettelgeist`);

    const backedUp = await fs.readFile(result.backup as string, 'utf8');
    expect(backedUp).toBe('#!/bin/sh\necho "user hook"\n');

    const installed = await fs.readFile(hookPath, 'utf8');
    expect(installed).toBe(HOOK_BLOCK + '\n');
  });

  it('without force throws on pre-existing non-marker content', async () => {
    const hookPath = path.join(tmp, '.git', 'hooks', 'pre-commit');
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(hookPath, 'echo "user hook"\n', 'utf8');

    await expect(installPreCommitHook(tmp)).rejects.toThrow(/non-marker/i);
  });
});
