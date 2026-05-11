import { describe, expect, it, beforeEach } from 'vitest';
import type { SpecSummary, ZettelgeistBackend } from '../../src/backend.js';
import { showEditModal } from '../../src/components/edit-modal.js';

const BASE_SPEC: SpecSummary = {
  name: 'foo',
  status: 'in-progress',
  progress: '2/5',
  blockedBy: null,
  frontmatterStatus: null,
  pr: null,
  branch: null,
  worktree: null,
};

function mockBackend(overrides: Partial<ZettelgeistBackend> = {}): ZettelgeistBackend {
  return {
    listSpecs: async () => [],
    readSpec: async () => ({ name: '', frontmatter: {}, requirements: null, tasks: [], handoff: null, lenses: {} }),
    readSpecFile: async () => ({ content: '' }),
    validateRepo: async () => ({ errors: [] }),
    listDocs: async () => [],
    readDoc: async () => ({ rendered: '', metadata: { title: '' } }),
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

describe('showEditModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders fields populated from the spec', async () => {
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend();
    void showEditModal({
      spec: { ...BASE_SPEC, pr: 'https://github.com/x/y/pull/3', branch: 'feat/b', frontmatterStatus: 'blocked', blockedBy: 'IDP' },
    });
    await Promise.resolve();
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.zg-edit-input');
    expect(inputs.length).toBeGreaterThan(0);
    const sel = document.querySelector<HTMLSelectElement>('select.zg-edit-input')!;
    expect(sel.value).toBe('blocked');
  });

  it('saving pr+branch calls patchFrontmatter with diff only', async () => {
    let captured: Record<string, unknown> | null = null;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend({
      patchFrontmatter: async (_name, patch) => { captured = patch; return { commit: 'abc' }; },
    });
    const p = showEditModal({ spec: { ...BASE_SPEC } });
    await Promise.resolve();

    const prInput = document.querySelectorAll<HTMLInputElement>('input.zg-edit-input')[0]!;
    const branchInput = document.querySelectorAll<HTMLInputElement>('input.zg-edit-input')[1]!;
    prInput.value = 'https://github.com/x/y/pull/9';
    branchInput.value = 'feat/x';

    const saveBtn = document.querySelector<HTMLButtonElement>('.zg-modal-confirm')!;
    saveBtn.click();
    await p;

    expect(captured).toEqual({ pr: 'https://github.com/x/y/pull/9', branch: 'feat/x' });
  });

  it('clearing a previously-set pr sends null in the patch', async () => {
    let captured: Record<string, unknown> | null = null;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend({
      patchFrontmatter: async (_name, patch) => { captured = patch; return { commit: 'abc' }; },
    });
    const p = showEditModal({ spec: { ...BASE_SPEC, pr: 'https://x/pull/1' } });
    await Promise.resolve();

    const prInput = document.querySelectorAll<HTMLInputElement>('input.zg-edit-input')[0]!;
    prInput.value = '';

    document.querySelector<HTMLButtonElement>('.zg-modal-confirm')!.click();
    await p;

    expect(captured).toEqual({ pr: null });
  });

  it('cancel resolves false and does not call backend', async () => {
    let called = false;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend({
      patchFrontmatter: async () => { called = true; return { commit: 'abc' }; },
      setStatus: async () => { called = true; return { commit: 'abc' }; },
    });
    const p = showEditModal({ spec: { ...BASE_SPEC } });
    await Promise.resolve();
    document.querySelector<HTMLButtonElement>('.zg-modal-cancel')!.click();
    const result = await p;
    expect(result).toBe(false);
    expect(called).toBe(false);
  });

  it('blocked status without reason shows validation error', async () => {
    let setStatusCalled = false;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend({
      setStatus: async () => { setStatusCalled = true; return { commit: 'abc' }; },
    });
    showEditModal({ spec: { ...BASE_SPEC } });
    await Promise.resolve();

    const sel = document.querySelector<HTMLSelectElement>('select.zg-edit-input')!;
    sel.value = 'blocked';
    sel.dispatchEvent(new Event('change'));

    document.querySelector<HTMLButtonElement>('.zg-modal-confirm')!.click();
    await Promise.resolve();

    expect(setStatusCalled).toBe(false);
    const errEl = document.querySelector('.zg-modal-error') as HTMLElement;
    expect(errEl.textContent).toMatch(/requires a reason/i);
    expect(errEl.style.display).toBe('');
  });
});
