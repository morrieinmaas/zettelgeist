import { describe, expect, it, beforeEach } from 'vitest';
import type { ZettelgeistBackend, SpecSummary } from '../../src/backend.js';
import { renderBoard } from '../../src/views/board.js';

const SAMPLE_SPECS: SpecSummary[] = [
  { name: 'user-auth', status: 'in-progress', progress: '3/5', blockedBy: null,        pr: null, branch: null, worktree: null, frontmatterStatus: null },
  { name: 'payment',   status: 'blocked',     progress: '2/8', blockedBy: 'IDP creds', pr: null, branch: null, worktree: null, frontmatterStatus: null },
  { name: 'reports',   status: 'planned',     progress: '0/3', blockedBy: null,        pr: null, branch: null, worktree: null, frontmatterStatus: null },
];

function mockBackend(): ZettelgeistBackend {
  return {
    listSpecs: async () => SAMPLE_SPECS,
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
  };
}

describe('renderBoard', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = mockBackend();
  });

  it('renders an empty-state instead of the board when there are no specs', async () => {
    const backend = mockBackend();
    backend.listSpecs = async () => [];
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();
    expect(document.querySelector('.zg-empty-state')).not.toBeNull();
    expect(document.querySelector('.zg-board')).toBeNull();
    expect(document.body.textContent).toMatch(/No specs yet/);
  });

  it('renders 7 columns', async () => {
    await renderBoard();
    const columns = document.querySelectorAll('.zg-column');
    expect(columns.length).toBe(7);
  });

  it('places each spec in its status column', async () => {
    await renderBoard();
    const inProgressCards = document.querySelectorAll('[data-status="in-progress"] .zg-card');
    expect(inProgressCards.length).toBe(1);
    expect(inProgressCards[0]?.getAttribute('data-spec')).toBe('user-auth');

    const blockedCards = document.querySelectorAll('[data-status="blocked"] .zg-card');
    expect(blockedCards.length).toBe(1);
    expect(blockedCards[0]?.getAttribute('data-spec')).toBe('payment');
  });

  it('shows progress and blockedBy on each card', async () => {
    await renderBoard();
    const paymentCard = document.querySelector('[data-spec="payment"]');
    expect(paymentCard?.textContent).toContain('2/8');
    expect(paymentCard?.textContent).toContain('IDP creds');
  });

  it('renders empty columns with count 0', async () => {
    await renderBoard();
    const draftColumn = document.querySelector('[data-status="draft"]');
    expect(draftColumn?.querySelector('.zg-column-count')?.textContent).toBe('0');
    expect(draftColumn?.querySelectorAll('.zg-card').length).toBe(0);
  });

  it('shows error message when backend.listSpecs throws', async () => {
    const backend = mockBackend();
    backend.listSpecs = async () => { throw new Error('network down'); };
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();
    const app = document.getElementById('app')!;
    expect(app.innerHTML).toContain('Failed to load');
    expect(app.innerHTML).toContain('network down');
  });

  it('navigates to spec detail when card is clicked', async () => {
    await renderBoard();
    const card = document.querySelector('[data-spec="user-auth"]') as HTMLElement;
    card.click();
    expect(window.location.hash).toBe('#/spec/user-auth');
  });

  // happy-dom supports DataTransfer + DragEvent constructors but does not
  // propagate `dataTransfer` from the DragEventInit. We attach it manually via
  // defineProperty so the event handlers in board.ts / card.ts see it.
  // The Playwright e2e in Task 27 covers the real user-level interaction.
  function dragEvent(type: string, dt: DataTransfer): DragEvent {
    const e = new DragEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: dt, configurable: true });
    return e;
  }

  it('marks Blocked column as drop target on dragover', async () => {
    await renderBoard();
    const blockedColumn = document.querySelector(
      '[data-status="blocked"]',
    ) as HTMLElement;
    blockedColumn.dispatchEvent(dragEvent('dragover', new DataTransfer()));
    expect(blockedColumn.classList.contains('zg-column-drop-target')).toBe(true);
  });

  it('marks every column as drop target on dragover (drag-to-any-column)', async () => {
    await renderBoard();
    for (const status of ['draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled']) {
      const column = document.querySelector(`[data-status="${status}"]`) as HTMLElement;
      column.dispatchEvent(dragEvent('dragover', new DataTransfer()));
      expect(column.classList.contains('zg-column-drop-target')).toBe(true);
    }
  });

  it('card dragstart sets text/plain to spec name and status', async () => {
    await renderBoard();
    const card = document.querySelector('[data-spec="user-auth"]') as HTMLElement;
    const dt = new DataTransfer();
    card.dispatchEvent(dragEvent('dragstart', dt));
    expect(dt.getData('text/plain')).toBe('user-auth');
    expect(dt.getData('application/x-zg-status')).toBe('in-progress');
  });

  it('drop on a non-override column calls setStatus without prompting', async () => {
    const backend = mockBackend();
    let captured: { name: string; status: string | null; reason: string | undefined } | null = null;
    backend.setStatus = async (name, status, reason) => {
      captured = { name, status, reason };
      return { commit: 'abc' };
    };
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();

    const doneColumn = document.querySelector('[data-status="done"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', 'user-auth');
    dt.setData('application/x-zg-status', 'in-progress');
    doneColumn.dispatchEvent(dragEvent('drop', dt));

    await new Promise((r) => setTimeout(r, 0));
    expect(captured).not.toBeNull();
    expect(captured!.name).toBe('user-auth');
    expect(captured!.status).toBe('done');
    expect(captured!.reason).toBeUndefined();
  });

  it('drop on origin column is a no-op (does not call setStatus)', async () => {
    const backend = mockBackend();
    let called = false;
    backend.setStatus = async () => { called = true; return { commit: 'abc' }; };
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();

    const inProgressColumn = document.querySelector('[data-status="in-progress"]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', 'user-auth');
    dt.setData('application/x-zg-status', 'in-progress');
    inProgressColumn.dispatchEvent(dragEvent('drop', dt));

    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(false);
  });

  it('renders a PR badge when spec.pr is set', async () => {
    const specs: SpecSummary[] = [
      { ...SAMPLE_SPECS[0]!, pr: 'https://github.com/x/y/pull/42' },
    ];
    const backend = mockBackend();
    backend.listSpecs = async () => specs;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();
    const badge = document.querySelector('[data-spec="user-auth"] .zg-badge-pr');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('PR #42');
    expect(badge!.getAttribute('href')).toBe('https://github.com/x/y/pull/42');
  });

  it('renders a branch badge when spec.branch is set', async () => {
    const specs: SpecSummary[] = [
      { ...SAMPLE_SPECS[0]!, branch: 'feat/x' },
    ];
    const backend = mockBackend();
    backend.listSpecs = async () => specs;
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();
    const badge = document.querySelector('[data-spec="user-auth"] .zg-badge-branch');
    expect(badge?.textContent).toBe('feat/x');
  });

  it('clicking the card pencil button does not navigate', async () => {
    const initialHash = window.location.hash;
    await renderBoard();
    const editBtn = document.querySelector<HTMLButtonElement>('[data-spec="user-auth"] .zg-card-edit')!;
    expect(editBtn).not.toBeNull();
    editBtn.click();
    expect(window.location.hash).toBe(initialHash);
  });

  it('escapes error messages in the error UI', async () => {
    const backend = mockBackend();
    backend.listSpecs = async () => { throw new Error('<img src=x onerror=alert(1)>'); };
    (window as Window & { zettelgeistBackend?: ZettelgeistBackend }).zettelgeistBackend = backend;
    await renderBoard();
    const app = document.getElementById('app')!;
    expect(app.innerHTML).not.toContain('<img src=x');
    expect(app.innerHTML).toContain('&lt;img');
  });
});
