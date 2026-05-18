import { describe, expect, it } from 'vitest';
import { gatherContext } from '../src/context.js';
import { makeMemFsReader as makeMemFs } from './helpers/mem-fs.js';

const ZG_YAML = 'format_version: "0.1"\n';

describe('gatherContext — status mode', () => {
  it('returns INDEX state plus an empty claimed list when nothing is claimed', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '---\nstatus: draft\n---\n# Foo\n',
      'specs/INDEX.md':
        'header text\n<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n## State\nrows\n',
    });
    const r = await gatherContext(fs, { mode: 'status' });
    if (r.mode !== 'status') throw new Error('wrong mode');
    expect(r.indexState).toContain('## State');
    expect(r.claimed).toEqual([]);
    expect(r.recentReleases).toEqual([]);
  });

  it('surfaces currently-claimed specs with their per-actor agent ids', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '# Foo\n',
      'specs/foo/.claim-alice': 'alice\n',
      'specs/foo/.claim-bob': 'bob\n',
      'specs/bar/requirements.md': '# Bar\n',
    });
    const r = await gatherContext(fs, { mode: 'status' });
    if (r.mode !== 'status') throw new Error('wrong mode');
    expect(r.claimed).toEqual([{ specName: 'foo', agents: ['alice', 'bob'] }]);
  });

  it('lists the 3 most recent cycle releases across all specs, newest first', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/a/requirements.md': '# A\n',
      'specs/a/.log.md':
        '## ⊢ T1 · agent=alice · claim\n## ⊣ T2 · agent=alice · release · sha=aaa\n',
      'specs/b/requirements.md': '# B\n',
      'specs/b/.log.md':
        '## ⊢ T3 · agent=bob · claim\n## ⊣ T4 · agent=bob · release · sha=bbb\n',
      'specs/c/requirements.md': '# C\n',
      'specs/c/.log.md':
        '## ⊢ T5 · agent=carol · claim\n## ⊣ T6 · agent=carol · release · sha=ccc\n',
    });
    const r = await gatherContext(fs, { mode: 'status' });
    if (r.mode !== 'status') throw new Error('wrong mode');
    expect(r.recentReleases.map((x) => x.specName)).toEqual(['c', 'b', 'a']);
    expect(r.recentReleases[0]!.sha).toBe('ccc');
  });
});

describe('gatherContext — spec mode', () => {
  it('returns frontmatter, handoff, and the most recent cycle', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md':
        '---\nstatus: in-progress\ndepends_on: [bar]\n---\n# Foo\n',
      'specs/foo/handoff.md': 'last session: working on auth\n',
      'specs/foo/.log.md':
        '## ⊢ T1 · agent=alice · claim\n- T2 · agent=alice · tick_task(1)\n## ⊣ T3 · agent=alice · release · sha=abc\n',
    });
    const r = await gatherContext(fs, { mode: 'spec', specName: 'foo' });
    if (r.mode !== 'spec') throw new Error('wrong mode');
    expect(r.frontmatter).toEqual({ status: 'in-progress', depends_on: ['bar'] });
    expect(r.handoff).toContain('working on auth');
    expect(r.mostRecentCycle?.close?.sha).toBe('abc');
  });

  it('prefers an open cycle over the most recent closed one (resumability)', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '# Foo\n',
      'specs/foo/.log.md':
        '## ⊢ T1 · agent=alice · claim\n## ⊣ T2 · agent=alice · release · sha=closed\n' +
        '## ⊢ T3 · agent=bob · claim\n- T4 · agent=bob · tick_task(1)\n',
    });
    const r = await gatherContext(fs, { mode: 'spec', specName: 'foo' });
    if (r.mode !== 'spec') throw new Error('wrong mode');
    expect(r.mostRecentCycle?.close).toBeNull();
    expect(r.mostRecentCycle?.open.agentId).toBe('bob');
  });

  it('returns null cycle when the spec has no .log.md', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '# Foo\n',
    });
    const r = await gatherContext(fs, { mode: 'spec', specName: 'foo' });
    if (r.mode !== 'spec') throw new Error('wrong mode');
    expect(r.mostRecentCycle).toBeNull();
  });

  it('throws on unknown spec name', async () => {
    const fs = makeMemFs({ '.zettelgeist.yaml': ZG_YAML });
    await expect(gatherContext(fs, { mode: 'spec', specName: 'nope' })).rejects.toThrow(/no spec/);
  });
});

describe('gatherContext — log mode', () => {
  function fsWithCycles(n: number) {
    const lines: string[] = [];
    for (let i = 1; i <= n; i++) {
      lines.push(`## ⊢ T${i}a · agent=a · claim`);
      lines.push(`## ⊣ T${i}b · agent=a · release · sha=sha${i}`);
    }
    return makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '# Foo\n',
      'specs/foo/.log.md': lines.join('\n') + '\n',
    });
  }

  it('returns the most recent cycle at offset 0', async () => {
    const fs = fsWithCycles(3);
    const r = await gatherContext(fs, { mode: 'log', specName: 'foo' });
    if (r.mode !== 'log') throw new Error('wrong mode');
    expect(r.offset).toBe(0);
    expect(r.totalCycles).toBe(3);
    expect(r.cycle.close?.sha).toBe('sha3');
  });

  it('scrolls back with --offset N (newest-first indexing)', async () => {
    const fs = fsWithCycles(3);
    const r = await gatherContext(fs, { mode: 'log', specName: 'foo', offset: 2 });
    if (r.mode !== 'log') throw new Error('wrong mode');
    expect(r.cycle.close?.sha).toBe('sha1');
  });

  it('throws with a git-log hint when offset exceeds available cycles', async () => {
    const fs = fsWithCycles(2);
    await expect(
      gatherContext(fs, { mode: 'log', specName: 'foo', offset: 5 }),
    ).rejects.toThrow(/rotated out.*git log/);
  });

  it('--log offset 0 returns the OPEN cycle when one is in progress', async () => {
    // Load-bearing invariant: the parser preserves chronological order
    // so the open cycle ends up last in the array, which becomes index 0
    // after `[...cycles].reverse()`. If anyone changes the parser's
    // ordering this test will catch it.
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '# Foo\n',
      'specs/foo/.log.md':
        '## ⊢ T1 · agent=a · claim\n## ⊣ T2 · agent=a · release · sha=closed1\n' +
        '## ⊢ T3 · agent=a · claim\n## ⊣ T4 · agent=a · release · sha=closed2\n' +
        '## ⊢ T5 · agent=b · claim\n- T6 · agent=b · tick_task(1)\n',
    });
    const r = await gatherContext(fs, { mode: 'log', specName: 'foo' });
    if (r.mode !== 'log') throw new Error('wrong mode');
    expect(r.totalCycles).toBe(3);
    expect(r.offset).toBe(0);
    expect(r.cycle.close).toBeNull(); // it's the open cycle
    expect(r.cycle.open.agentId).toBe('b');
    // Scrolling back one should reveal the most recent CLOSED cycle.
    const back1 = await gatherContext(fs, { mode: 'log', specName: 'foo', offset: 1 });
    if (back1.mode !== 'log') throw new Error('wrong mode');
    expect(back1.cycle.close?.sha).toBe('closed2');
  });

  it('throws on a spec with no .log.md', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '# Foo\n',
    });
    await expect(gatherContext(fs, { mode: 'log', specName: 'foo' })).rejects.toThrow(/no .log.md/);
  });
});

describe('gatherContext — metadata mode', () => {
  it('returns full frontmatter when no key specified', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md':
        '---\nstatus: planned\ndepends_on: [bar]\nblocked_by: idp\n---\n# Foo\n',
    });
    const r = await gatherContext(fs, { mode: 'metadata', specName: 'foo' });
    if (r.mode !== 'metadata') throw new Error('wrong mode');
    expect(r.frontmatter).toEqual({
      status: 'planned',
      depends_on: ['bar'],
      blocked_by: 'idp',
    });
    expect(r.key).toBeUndefined();
  });

  it('returns one key when specified', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '---\nstatus: blocked\nblocked_by: idp\n---\n# Foo\n',
    });
    const r = await gatherContext(fs, { mode: 'metadata', specName: 'foo', metadataKey: 'status' });
    if (r.mode !== 'metadata') throw new Error('wrong mode');
    expect(r.key).toBe('status');
    expect(r.value).toBe('blocked');
  });

  it('returns undefined value for a missing key (not an error)', async () => {
    const fs = makeMemFs({
      '.zettelgeist.yaml': ZG_YAML,
      'specs/foo/requirements.md': '---\nstatus: draft\n---\n# Foo\n',
    });
    const r = await gatherContext(fs, { mode: 'metadata', specName: 'foo', metadataKey: 'pr' });
    if (r.mode !== 'metadata') throw new Error('wrong mode');
    expect(r.value).toBeUndefined();
  });
});
