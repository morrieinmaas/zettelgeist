import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ZettelgeistBackend, SpecDetail } from '../../src/backend.js';
import { renderDetail } from '../../src/views/detail.js';

const SAMPLE_SPEC: SpecDetail = {
  name: 'user-auth',
  frontmatter: { depends_on: ['billing'] },
  requirements: '# User Auth\n\nThe spec body.',
  tasks: [
    { index: 1, checked: true,  text: 'Add SAML',     tags: [] },
    { index: 2, checked: false, text: 'Add OIDC',     tags: [] },
    { index: 3, checked: false, text: 'Get sign-off', tags: ['#human-only'] },
  ],
  handoff: 'Last session notes.',
  lenses: { design: '# Design\n\nNotes.' },
};

function mockBackend(overrides: Partial<ZettelgeistBackend> = {}): ZettelgeistBackend {
  return {
    listSpecs: async () => [],
    readSpec: async () => SAMPLE_SPEC,
    readSpecFile: async () => ({ content: '' }),
    validateRepo: async () => ({ errors: [] }),
    listDocs: async () => [],
    readDoc: async () => ({ rendered: '', metadata: { title: '' } }),
    writeSpecFile: async () => ({ commit: 'abc' }),
    tickTask: async () => ({ commit: 'abc' }),
    untickTask: async () => ({ commit: 'abc' }),
    setStatus: async () => ({ commit: 'abc' }),
    writeHandoff: async () => ({ commit: 'abc' }),
    regenerateIndex: async () => ({ commit: null }),
    claimSpec: async () => ({ acknowledged: true }),
    releaseSpec: async () => ({ acknowledged: true }),
    ...overrides,
  };
}

describe('renderDetail', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend();
  });

  it('renders the spec name in the header', async () => {
    await renderDetail({ name: 'user-auth' });
    expect(document.querySelector('.zg-detail-header h2')?.textContent).toBe('user-auth');
  });

  it('renders 4 tabs when lenses exist (Requirements, Tasks, Handoff, Lenses)', async () => {
    await renderDetail({ name: 'user-auth' });
    const buttons = document.querySelectorAll('.zg-tab-nav button');
    expect(buttons.length).toBe(4);
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('Requirements');
    expect(labels).toContain('Tasks (3)');
    expect(labels).toContain('Handoff');
    expect(labels).toContain('Lenses');
  });

  it('omits Lenses tab when no lenses present', async () => {
    const backend = mockBackend({
      readSpec: async () => ({ ...SAMPLE_SPEC, lenses: {} }),
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });
    const buttons = document.querySelectorAll('.zg-tab-nav button');
    expect(buttons.length).toBe(3);
  });

  it('renders requirements markdown by default (first tab)', async () => {
    await renderDetail({ name: 'user-auth' });
    const content = document.querySelector('.zg-tab-content');
    expect(content?.innerHTML).toContain('User Auth');
  });

  it('switches to tasks tab when clicked, showing checkboxes', async () => {
    await renderDetail({ name: 'user-auth' });
    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('calls backend.tickTask when an unchecked task is checked', async () => {
    const tickSpy = vi.fn(async () => ({ commit: 'abc123' }));
    const backend = mockBackend({ tickTask: tickSpy });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();

    const secondCheckbox = document.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement;
    secondCheckbox.checked = true;
    secondCheckbox.dispatchEvent(new Event('change'));

    // Wait microtask for async handler
    await new Promise((r) => setTimeout(r, 10));

    expect(tickSpy).toHaveBeenCalledWith('user-auth', 2);
  });

  it('shows error message when readSpec fails', async () => {
    const backend = mockBackend({
      readSpec: async () => { throw new Error('not found'); },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'ghost' });
    expect(document.getElementById('app')?.innerHTML).toContain('Failed to load');
  });

  it('renders inline tags as badges', async () => {
    await renderDetail({ name: 'user-auth' });
    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();
    const tags = document.querySelectorAll('.zg-tag');
    expect(tags.length).toBe(1);
    expect(tags[0]?.textContent).toBe('#human-only');
  });
});
