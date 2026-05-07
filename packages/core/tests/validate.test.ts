import { describe, expect, it } from 'vitest';
import type { FsReader } from '../src/loader.js';
import { validateRepo } from '../src/validate.js';

function makeMemFs(files: Record<string, string>): FsReader {
  const dirs = new Set<string>();
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  return {
    async readDir(path) {
      const prefix = path === '' ? '' : `${path}/`;
      const seen = new Set<string>();
      const out: Array<{ name: string; isDir: boolean }> = [];
      for (const f of Object.keys(files)) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        const head = rest.split('/')[0];
        if (!head || seen.has(head)) continue;
        seen.add(head);
        const child = prefix + head;
        out.push({ name: head, isDir: dirs.has(child) });
      }
      return out;
    },
    async readFile(path) {
      const v = files[path];
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async exists(path) {
      return path in files || dirs.has(path);
    },
  };
}

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
