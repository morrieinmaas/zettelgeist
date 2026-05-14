import { describe, expect, it } from 'vitest';
import { validateRepo } from '../src/validate.js';
import { makeMemFsReader as makeMemFs } from './helpers/mem-fs.js';

describe('validateRepo', () => {
  it('returns no errors for a healthy repo', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/foo/requirements.md': '# Foo\n',
    });
    const r = await validateRepo(fs);
    expect(r.errors).toEqual([]);
  });

  it('reports E_EMPTY_SPEC for a folder under specs/ with no .md files', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/empty/.gitkeep': '',
    });
    const r = await validateRepo(fs);
    expect(r.errors).toEqual([{ code: 'E_EMPTY_SPEC', path: 'specs/empty' }]);
  });

  it('reports E_INVALID_FRONTMATTER when YAML cannot parse', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/foo/requirements.md': '---\nstatus: [unterminated\n---\n# Foo\n',
    });
    const r = await validateRepo(fs);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.code).toBe('E_INVALID_FRONTMATTER');
    expect(r.errors[0]?.path).toBe('specs/foo/requirements.md');
  });

  it('reports E_CYCLE with the cycle path', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/a/requirements.md': '---\ndepends_on: [b]\n---\n',
      'specs/b/requirements.md': '---\ndepends_on: [a]\n---\n',
    });
    const r = await validateRepo(fs);
    expect(r.errors).toContainEqual({ code: 'E_CYCLE', path: ['a', 'b'] });
  });
});
