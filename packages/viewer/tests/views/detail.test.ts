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
    ...overrides,
  };
}

describe('renderDetail', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    // Detail view now persists the active tab across re-renders via
    // sessionStorage. Clear between tests so each one starts fresh on
    // the Requirements tab.
    try { sessionStorage.clear(); } catch { /* ignore */ }
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

  it('appends a new task to tasks.md via writeSpecFile', async () => {
    let written: { rel: string; content: string } | null = null;
    const backend = mockBackend({
      readSpecFile: async () => ({ content: '- [ ] 1. one\n- [ ] 2. two\n' }),
      writeSpecFile: async (_name, rel, content) => { written = { rel, content }; return { commit: 'abc' }; },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();

    const input = document.querySelector('.zg-task-add-input') as HTMLInputElement;
    input.value = 'a brand new task';
    const btn = document.querySelector('.zg-task-add-btn') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(written).not.toBeNull();
    expect(written!.rel).toBe('tasks.md');
    expect(written!.content).toContain('- [ ] 3. a brand new task');
  });

  it('inline-edits a task text and writes the new tasks.md', async () => {
    let written: string | null = null;
    const backend = mockBackend({
      readSpecFile: async () => ({ content: '- [x] 1. Add SAML\n- [ ] 2. Add OIDC\n- [ ] 3. Get sign-off\n' }),
      writeSpecFile: async (_name, _rel, content) => { written = content; return { commit: 'abc' }; },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();

    const editBtns = document.querySelectorAll<HTMLButtonElement>('.zg-task-edit');
    editBtns[1]!.click();  // edit task 2 ("Add OIDC")
    const input = document.querySelector('.zg-task-edit-input') as HTMLInputElement;
    input.value = 'Wire OIDC + CSRF';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 10));

    expect(written).not.toBeNull();
    expect(written!).toContain('- [x] 1. Add SAML');
    expect(written!).toContain('- [ ] 2. Wire OIDC + CSRF');
    expect(written!).toContain('- [ ] 3. Get sign-off');
  });

  it('deletes a task and renumbers the rest', async () => {
    let written: string | null = null;
    const backend = mockBackend({
      readSpecFile: async () => ({ content: '- [x] 1. Add SAML\n- [ ] 2. Add OIDC\n- [ ] 3. Get sign-off\n' }),
      writeSpecFile: async (_name, _rel, content) => { written = content; return { commit: 'abc' }; },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;

    await renderDetail({ name: 'user-auth' });
    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();

    const delBtns = document.querySelectorAll<HTMLButtonElement>('.zg-task-delete');
    delBtns[1]!.click();  // delete "Add OIDC"
    // The delete now uses an in-DOM confirm modal (window.confirm is silently
    // blocked in VSCode webviews). Click the modal's "Delete" button.
    await new Promise((r) => setTimeout(r, 10));
    const confirmBtn = document.querySelector<HTMLButtonElement>('.zg-modal-overlay .zg-modal-confirm');
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(written).not.toBeNull();
    expect(written!).toContain('- [x] 1. Add SAML');
    expect(written!).toContain('- [ ] 2. Get sign-off');  // renumbered down from 3 → 2
    expect(written!).not.toContain('Add OIDC');
  });

  it('ticking a GFM checkbox in requirements body saves the toggled line', async () => {
    const spec: SpecDetail = {
      ...SAMPLE_SPEC,
      requirements: '## Acceptance criteria\n\n- [ ] WHEN trigger\n- [ ] THE SYSTEM SHALL respond\n',
    };
    let writtenContent = '';
    const backend = mockBackend({
      readSpec: async () => spec,
      readSpecFile: async () => ({ content: '---\ndepends_on: [billing]\n---\n' + spec.requirements }),
      writeSpecFile: async (_name, _rel, content) => { writtenContent = content; return { commit: 'abc' }; },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    // Find the first checkbox in the rendered requirements body and click it.
    const cb = document.querySelector<HTMLInputElement>('.zg-markdown input[type="checkbox"]')!;
    expect(cb.disabled).toBe(false);
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 10));

    expect(writtenContent).toContain('- [x] WHEN trigger');
    expect(writtenContent).toContain('- [ ] THE SYSTEM SHALL respond');
    expect(writtenContent).toContain('depends_on: [billing]');  // frontmatter preserved
  });

  it('shows progress + status pill in the header', async () => {
    const backend = mockBackend({
      listSpecs: async () => [{
        name: 'user-auth', status: 'in-progress', progress: '1/3',
        blockedBy: null, frontmatterStatus: null, pr: null, branch: null, worktree: null,
      }],
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    const pill = document.querySelector('.zg-status-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('in-progress');
    expect(pill.classList.contains('zg-status-in-progress')).toBe(true);

    const progress = document.querySelector('.zg-detail-progress')!;
    expect(progress.textContent).toContain('1/3');
  });

  it('renders inline edit button on requirements body; clicking swaps to textarea', async () => {
    await renderDetail({ name: 'user-auth' });
    const editBtn = document.querySelector('.zg-md-edit-btn') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();
    editBtn.click();
    const ta = document.querySelector('.zg-md-textarea') as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    expect(ta.value).toBe(SAMPLE_SPEC.requirements);
  });

  it('saving a requirements edit calls writeSpecFile with the spliced frontmatter + new body', async () => {
    let writtenContent = '';
    const backend = mockBackend({
      // simulate the existing full file with frontmatter
      readSpecFile: async () => ({ content: '---\ndepends_on: [billing]\n---\n# old body\n' }),
      writeSpecFile: async (_name, _rel, content) => { writtenContent = content; return { commit: 'abc' }; },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    (document.querySelector('.zg-md-edit-btn') as HTMLButtonElement).click();
    const ta = document.querySelector('.zg-md-textarea') as HTMLTextAreaElement;
    ta.value = '# new body\n';
    document.querySelectorAll<HTMLButtonElement>('.zg-modal-confirm')[0]!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(writtenContent).toContain('depends_on: [billing]');
    expect(writtenContent).toContain('# new body');
    expect(writtenContent).not.toContain('# old body');
  });

  it('saving a handoff edit calls writeHandoff', async () => {
    let captured = '';
    const backend = mockBackend({
      writeHandoff: async (_name, content) => { captured = content; return { commit: 'abc' }; },
    });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'user-auth' });

    const handoffBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent === 'Handoff') as HTMLButtonElement;
    handoffBtn.click();

    (document.querySelector('.zg-md-edit-btn') as HTMLButtonElement).click();
    const ta = document.querySelector('.zg-md-textarea') as HTMLTextAreaElement;
    ta.value = 'New handoff notes.\n';
    document.querySelector<HTMLButtonElement>('.zg-modal-confirm')!.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(captured).toBe('New handoff notes.\n');
  });

  it('persists the active tab across re-renders (so ticking a task does not snap to Requirements)', async () => {
    await renderDetail({ name: 'user-auth' });

    // Open Tasks tab.
    const tasksBtn = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    tasksBtn.click();
    expect(tasksBtn.classList.contains('active')).toBe(true);

    // Re-render the view (what tickTask does via hashchange).
    await renderDetail({ name: 'user-auth' });

    // Tasks tab should still be the active one.
    const tasksBtnAfter = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent?.startsWith('Tasks')) as HTMLButtonElement;
    expect(tasksBtnAfter.classList.contains('active')).toBe(true);

    // And the Requirements tab is NOT active.
    const reqBtnAfter = Array.from(document.querySelectorAll('.zg-tab-nav button'))
      .find((b) => b.textContent === 'Requirements') as HTMLButtonElement;
    expect(reqBtnAfter.classList.contains('active')).toBe(false);
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

  it('sanitizes script tags out of requirements markdown', async () => {
    // happy-dom's DOM parser executes inline <script> when DOMPurify constructs
    // its working tree, which is *not* how real browsers behave (innerHTML never
    // executes script). So we don't assert on side-effects — we only assert that
    // the sanitized HTML stamped into the live DOM contains no <script>.
    const malicious = '# Foo\n\n<script>window.PWNED_DETAIL = true;</script>\n\nNormal content.\n';
    const backend = mockBackend({ readSpec: async () => ({ ...SAMPLE_SPEC, requirements: malicious }) });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'foo' });
    const tabContent = document.querySelector('.zg-tab-content');
    expect(tabContent?.innerHTML ?? '').not.toContain('<script>');
    expect(tabContent?.innerHTML ?? '').not.toContain('PWNED_DETAIL');
  });

  it('sanitizes onerror attributes out of img tags', async () => {
    const malicious = '<img src=x onerror="alert(1)">\n';
    const backend = mockBackend({ readSpec: async () => ({ ...SAMPLE_SPEC, requirements: malicious }) });
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderDetail({ name: 'foo' });
    const tabContent = document.querySelector('.zg-tab-content')?.innerHTML ?? '';
    expect(tabContent).not.toContain('onerror');
  });
});
