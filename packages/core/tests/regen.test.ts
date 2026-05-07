import { describe, expect, it } from 'vitest';
import { regenerateIndex } from '../src/regen.js';
import type { RepoState, Spec } from '../src/types.js';

const noState: RepoState = { claimedSpecs: new Set(), mergedSpecs: new Set() };

function spec(name: string, fm: Record<string, unknown> = {}, tasks: Spec['tasks'] = []): Spec {
  return {
    name,
    frontmatter: fm as Spec['frontmatter'],
    requirements: null,
    tasks,
    handoff: null,
    lenses: new Map(),
  };
}

describe('regenerateIndex', () => {
  it('emits the empty layout when no specs exist (no existing file)', () => {
    const out = regenerateIndex([], noState, null);
    expect(out).toBe(
      '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n' +
        '\n' +
        '## State\n' +
        '\n' +
        '_No specs._\n' +
        '\n' +
        '## Graph\n' +
        '\n' +
        '_No specs._\n',
    );
  });

  it('preserves a pre-existing human region byte-identically', () => {
    const existing =
      '# Specs Index\n\n## Decisions\n\n- 2026-05-04: foo\n\n' +
      '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n\n## State\n\n(stale)\n';
    const out = regenerateIndex([], noState, existing);
    expect(out.startsWith('# Specs Index\n\n## Decisions\n\n- 2026-05-04: foo\n\n')).toBe(true);
    expect(out).toContain('_No specs._');
  });

  it('treats existing content without a marker as the human region', () => {
    const existing = '# Notes\n\nAnything goes here.\n';
    const out = regenerateIndex([], noState, existing);
    expect(out).toBe(
      '# Notes\n\nAnything goes here.\n\n' +
        '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n' +
        '\n' +
        '## State\n' +
        '\n' +
        '_No specs._\n' +
        '\n' +
        '## Graph\n' +
        '\n' +
        '_No specs._\n',
    );
  });

  it('renders the state table with progress and blocked-by columns', () => {
    const specs = [
      spec('user-auth', {}, [
        { index: 1, checked: true, text: 'a', tags: [] },
        { index: 2, checked: false, text: 'b', tags: [] },
      ]),
      spec('payment', { depends_on: ['user-auth'], status: 'blocked', blocked_by: 'IDP creds' }),
    ];
    const out = regenerateIndex(specs, noState, null);
    expect(out).toContain('| user-auth | in-progress | 1/2 | — |');
    expect(out).toContain('| payment | blocked | 0/0 | IDP creds |');
  });

  it('renders the mermaid graph block with depends_on edges', () => {
    const specs = [
      spec('a'),
      spec('b', { depends_on: ['a'] }),
    ];
    const out = regenerateIndex(specs, noState, null);
    expect(out).toContain('```mermaid\ngraph TD\n  a\n  b\n  b --> a\n```\n');
  });
});
