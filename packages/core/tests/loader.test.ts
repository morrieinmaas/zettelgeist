import { describe, expect, it } from 'vitest';
import { loadAllSpecs } from '../src/loader.js';
import { makeMemFsReader as makeMemFs } from './helpers/mem-fs.js';

describe('loadAllSpecs', () => {
  it('returns empty array when specs/ does not exist', async () => {
    const fs = makeMemFs({ '.zettelgeist.yaml': 'format_version: "0.1"\n' });
    expect(await loadAllSpecs(fs)).toEqual([]);
  });

  it('loads a spec with only requirements.md and frontmatter', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/user-auth/requirements.md': '---\ndepends_on: [foo]\n---\n# User Auth\n',
    });
    const specs = await loadAllSpecs(fs);
    expect(specs).toHaveLength(1);
    expect(specs[0]?.name).toBe('user-auth');
    expect(specs[0]?.frontmatter).toEqual({ depends_on: ['foo'] });
    expect(specs[0]?.requirements).toBe('# User Auth\n');
    expect(specs[0]?.tasks).toEqual([]);
    expect(specs[0]?.handoff).toBeNull();
    expect(specs[0]?.lenses.size).toBe(0);
  });

  it('loads tasks.md and handoff.md when present', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/foo/requirements.md': '# Foo\n',
      'specs/foo/tasks.md': '- [x] One\n- [ ] Two\n',
      'specs/foo/handoff.md': 'last session...\n',
    });
    const [spec] = await loadAllSpecs(fs);
    expect(spec?.tasks.map((t) => t.checked)).toEqual([true, false]);
    expect(spec?.handoff).toBe('last session...\n');
  });

  it('loads lenses as a flat map keyed by filename without extension', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/foo/requirements.md': '# Foo\n',
      'specs/foo/lenses/design.md': 'design notes\n',
      'specs/foo/lenses/business.md': 'business notes\n',
    });
    const [spec] = await loadAllSpecs(fs);
    expect(Array.from(spec!.lenses.keys()).sort()).toEqual(['business', 'design']);
    expect(spec!.lenses.get('design')).toBe('design notes\n');
  });

  it('loads spec without requirements.md (frontmatter is empty)', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/foo/tasks.md': '- [ ] One\n',
    });
    const [spec] = await loadAllSpecs(fs);
    expect(spec?.requirements).toBeNull();
    expect(spec?.frontmatter).toEqual({});
    expect(spec?.tasks).toHaveLength(1);
  });

  it('skips folders under specs/ that contain no .md files', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/ghost/.gitkeep': '',
      'specs/real/requirements.md': '# Real\n',
    });
    const specs = await loadAllSpecs(fs);
    expect(specs.map((s) => s.name)).toEqual(['real']);
  });

  it('does NOT load a folder whose only .md file is .log.md (dotfile-prefixed markdown is walker-ignored)', async () => {
    // v0.3 §9.4 walker-exclusion: a stray .log.md (e.g. left behind
    // after a delete-spec, or written by a misuse) MUST NOT cause a
    // folder to be loaded as a spec. Without this, an empty cycle
    // history could resurrect a deleted spec as a phantom row in
    // INDEX.md.
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/zombie/.log.md':
        '## ⊢ T1 · agent=a · claim\n## ⊣ T2 · agent=a · release · sha=abc\n',
      'specs/real/requirements.md': '# Real\n',
    });
    const specs = await loadAllSpecs(fs);
    expect(specs.map((s) => s.name)).toEqual(['real']);
  });

  it('ignores .log.md when deriving spec state (no contribution to frontmatter/tasks/handoff)', async () => {
    // v0.3 §9.4: .log.md is metadata about *how* the spec evolved, not state.
    // The walker must not pick it up as if it were a recognised file.
    const fs = makeMemFs({
      '.zettelgeist.yaml': 'format_version: "0.1"\n',
      'specs/foo/requirements.md': '---\nstatus: planned\n---\n# Foo\n',
      'specs/foo/.log.md':
        '## ⊢ T1 · agent=a · claim\n- T2 · agent=a · tick_task(1)\n## ⊣ T3 · agent=a · release · sha=abc\n',
    });
    const specs = await loadAllSpecs(fs);
    expect(specs).toHaveLength(1);
    const spec = specs[0]!;
    expect(spec.name).toBe('foo');
    // .log.md must NOT pollute any of these:
    expect(spec.requirements).toBe('# Foo\n');
    expect(spec.tasks).toEqual([]);
    expect(spec.handoff).toBeNull();
    expect(spec.lenses.size).toBe(0);
    expect(spec.frontmatter).toEqual({ status: 'planned' });
  });
});
