import { describe, expect, it, beforeEach } from 'vitest';
import type { ZettelgeistBackend, SpecSummary, SpecDetail } from '../../src/backend.js';
import { renderGraph } from '../../src/views/graph.js';

function mockBackend(specs: SpecSummary[], details: Record<string, Partial<SpecDetail>> = {}): ZettelgeistBackend {
  return {
    listSpecs: async () => specs,
    readSpec: async (name) => ({
      name,
      frontmatter: details[name]?.frontmatter ?? {},
      requirements: null, tasks: [], handoff: null, lenses: {},
    }),
    readSpecFile: async () => ({ content: '' }),
    validateRepo: async () => ({ errors: [] }),
    listDocs: async () => [],
    readDoc: async () => ({ source: '', metadata: { title: '' } }),
    writeDoc: async () => ({ commit: 'abc' }),
    writeSpecFile: async () => ({ commit: 'abc' }),
    tickTask: async () => ({ commit: 'abc' }),
    untickTask: async () => ({ commit: 'abc' }),
    setStatus: async () => ({ commit: 'abc' }),
    patchFrontmatter: async () => ({ commit: 'abc' }),
    writeHandoff: async () => ({ commit: 'abc' }),
    regenerateIndex: async () => ({ commit: null }),
    claimSpec: async () => ({ acknowledged: true }),
    releaseSpec: async () => ({ acknowledged: true }),
  };
}

describe('renderGraph', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('shows an empty-state when there are no specs', async () => {
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend([]);
    await renderGraph();
    expect(document.querySelector('.zg-empty-state')).not.toBeNull();
    expect(document.body.textContent).toMatch(/No specs to graph/);
  });

  it('shows a Dependency Graph heading when specs exist', async () => {
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend([
      { name: 'a', status: 'draft', progress: '0/0', blockedBy: null, pr: null, branch: null, worktree: null, frontmatterStatus: null },
    ]);
    await renderGraph();
    expect(document.querySelector('.zg-graph h2')?.textContent).toBe('Dependency Graph');
  }, 15000);

  it('renders mermaid source as fallback when Mermaid CDN fails', async () => {
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend([
      { name: 'a', status: 'draft', progress: '0/0', blockedBy: null, pr: null, branch: null, worktree: null, frontmatterStatus: null },
      { name: 'b', status: 'draft', progress: '0/0', blockedBy: null, pr: null, branch: null, worktree: null, frontmatterStatus: null },
    ], { b: { frontmatter: { depends_on: ['a'] } } });
    await renderGraph();
    // happy-dom doesn't load CDN scripts → fallback renders the mermaid source
    const fallback = document.querySelector('.zg-graph-fallback, .zg-graph-container svg');
    // either the SVG was rendered (unlikely in happy-dom) or the fallback was shown
    expect(fallback).not.toBeNull();
    if (fallback?.classList.contains('zg-graph-fallback')) {
      expect(fallback.textContent).toContain('graph TD');
      expect(fallback.textContent).toContain('a');
      expect(fallback.textContent).toContain('b --> a');
    }
  }, 15000);
});
