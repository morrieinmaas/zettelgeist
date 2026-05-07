import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph.js';
import type { Spec } from '../src/types.js';

function spec(name: string, fm: Record<string, unknown> = {}): Spec {
  return {
    name,
    frontmatter: fm as Spec['frontmatter'],
    requirements: null,
    tasks: [],
    handoff: null,
    lenses: new Map(),
  };
}

describe('buildGraph', () => {
  it('returns empty graph for empty input', () => {
    expect(buildGraph([])).toEqual({ nodes: [], edges: [], blocks: [], cycles: [] });
  });

  it('builds nodes with part_of metadata', () => {
    const g = buildGraph([
      spec('a'),
      spec('b', { part_of: 'group1' }),
    ]);
    expect(g.nodes).toEqual([
      { name: 'a', partOf: null },
      { name: 'b', partOf: 'group1' },
    ]);
  });

  it('builds edges from depends_on (sorted by from then to)', () => {
    const g = buildGraph([
      spec('a', { depends_on: ['b', 'c'] }),
      spec('b'),
      spec('c'),
    ]);
    expect(g.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ]);
  });

  it('builds reverse blocks edges', () => {
    const g = buildGraph([
      spec('a', { depends_on: ['b'] }),
      spec('b'),
    ]);
    expect(g.blocks).toEqual([{ from: 'b', to: 'a' }]);
  });

  it('detects a simple 2-cycle', () => {
    const g = buildGraph([
      spec('a', { depends_on: ['b'] }),
      spec('b', { depends_on: ['a'] }),
    ]);
    expect(g.cycles).toEqual([['a', 'b']]);
  });

  it('detects a 3-cycle and starts the report at the lexicographically smallest name', () => {
    const g = buildGraph([
      spec('a', { depends_on: ['b'] }),
      spec('b', { depends_on: ['c'] }),
      spec('c', { depends_on: ['a'] }),
    ]);
    expect(g.cycles).toEqual([['a', 'b', 'c']]);
  });

  it('reports each cycle once even if discoverable from multiple roots', () => {
    const g = buildGraph([
      spec('a', { depends_on: ['b'] }),
      spec('b', { depends_on: ['a'] }),
      spec('c', { depends_on: ['a'] }),
    ]);
    expect(g.cycles).toEqual([['a', 'b']]);
  });

  it('ignores depends_on entries that point to nonexistent specs (no edge, no error)', () => {
    const g = buildGraph([spec('a', { depends_on: ['ghost'] })]);
    expect(g.edges).toEqual([]);
  });
});
