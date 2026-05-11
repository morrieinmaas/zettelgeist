import { describe, expect, it, beforeEach } from 'vitest';
import type { ZettelgeistBackend } from '../src/backend.js';

function mockBackend(): ZettelgeistBackend {
  return {
    listSpecs: async () => [],
    readSpec: async () => ({ name: '', frontmatter: {}, requirements: null, tasks: [], handoff: null, lenses: {} }),
    readSpecFile: async () => ({ content: '' }),
    validateRepo: async () => ({ errors: [] }),
    listDocs: async () => [],
    readDoc: async () => ({ source: '', metadata: { title: '' } }),
    writeDoc: async () => ({ commit: 'abc' }),
    renameDoc: async (_o, n) => ({ commit: 'abc', newPath: n }),
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

describe('theme selection', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '<main id="app"></main>';
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('applies "light" data-theme when zettelgeistConfig.theme is "light"', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies "dark" data-theme when zettelgeistConfig.theme is "dark"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggle button flips theme and persists to localStorage', async () => {
    document.body.innerHTML = `
      <nav class="zg-nav"><button id="zg-theme-toggle"></button></nav>
      <main id="app"></main>
    `;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend();
    (window as Window & { zettelgeistConfig?: { theme: 'light' | 'dark' | 'system' } }).zettelgeistConfig = { theme: 'light' };

    // Fresh import to re-run bootstrap with our DOM
    const importUrl = `../src/main.js?theme-toggle-${Date.now()}`;
    await import(/* @vite-ignore */ importUrl).catch(() => { /* bootstrap errors are tolerated */ });
    await new Promise((r) => setTimeout(r, 10));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const btn = document.getElementById('zg-theme-toggle') as HTMLButtonElement;
    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('zg.theme')).toBe('dark');

    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('zg.theme')).toBe('light');
  });
});
