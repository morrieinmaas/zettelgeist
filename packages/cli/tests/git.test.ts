import { describe, expect, it } from 'vitest';
import { mergeHookContent, HOOK_BLOCK } from '../src/git.js';

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
});
