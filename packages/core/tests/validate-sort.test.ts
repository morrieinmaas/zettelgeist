import { describe, expect, it } from 'vitest';
import { compareErrors } from '../src/validate.js';
import type { ValidationError } from '../src/types.js';

describe('error sort order', () => {
  it('sorts by code, then by path', () => {
    const errors: ValidationError[] = [
      { code: 'E_INVALID_FRONTMATTER', path: 'specs/x/requirements.md', detail: '' },
      { code: 'E_CYCLE', path: ['b', 'a'] },
      { code: 'E_EMPTY_SPEC', path: 'specs/y' },
      { code: 'E_CYCLE', path: ['a', 'c'] },
      { code: 'E_EMPTY_SPEC', path: 'specs/x' },
    ];
    const sorted = [...errors].sort(compareErrors);
    expect(
      sorted.map((e) => [e.code, Array.isArray(e.path) ? e.path.join('|') : e.path]),
    ).toEqual([
      ['E_CYCLE', 'a|c'],
      ['E_CYCLE', 'b|a'],
      ['E_EMPTY_SPEC', 'specs/x'],
      ['E_EMPTY_SPEC', 'specs/y'],
      ['E_INVALID_FRONTMATTER', 'specs/x/requirements.md'],
    ]);
  });
});
