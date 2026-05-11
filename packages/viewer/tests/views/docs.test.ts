import { describe, expect, it, beforeEach } from 'vitest';
import type { ZettelgeistBackend, DocEntry } from '../../src/backend.js';
import { renderDocs } from '../../src/views/docs.js';

const SAMPLE_DOCS: DocEntry[] = [
  { path: 'docs/superpowers/specs/foo.md', title: 'Foo Design' },
  { path: 'README.md', title: 'README' },
];

function mockBackend(docs: DocEntry[] = SAMPLE_DOCS): ZettelgeistBackend {
  return {
    listSpecs: async () => [],
    readSpec: async () => ({ name: '', frontmatter: {}, requirements: null, tasks: [], handoff: null, lenses: {} }),
    readSpecFile: async () => ({ content: '' }),
    validateRepo: async () => ({ errors: [] }),
    listDocs: async () => docs,
    readDoc: async (path) => ({ rendered: `<p>Rendered ${path}</p>`, metadata: { title: path.split('/').pop() ?? path } }),
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

describe('renderDocs', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend();
  });

  it('lists docs in the sidebar', async () => {
    await renderDocs({});
    const links = document.querySelectorAll('.zg-docs-list a');
    expect(links.length).toBe(2);
  });

  it('shows intro when no path selected', async () => {
    await renderDocs({});
    expect(document.querySelector('.zg-docs-main')?.textContent).toContain('Pick a document');
  });

  it('renders the selected doc when path is set', async () => {
    await renderDocs({ path: encodeURIComponent('README.md') });
    const main = document.querySelector('.zg-docs-main');
    expect(main?.innerHTML).toContain('Rendered README.md');
  });

  it('marks the active doc in the sidebar', async () => {
    await renderDocs({ path: encodeURIComponent('README.md') });
    const active = document.querySelector('.zg-docs-list a.active');
    expect(active?.textContent).toBe('README');
  });

  it('shows error when listDocs fails', async () => {
    const backend = mockBackend();
    backend.listDocs = async () => { throw new Error('forbidden'); };
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDocs({});
    expect(document.body.textContent).toContain('Failed to list');
  });
});
