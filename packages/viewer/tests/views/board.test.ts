import { describe, expect, it, beforeEach } from 'vitest';
import type { ZettelgeistBackend, SpecSummary } from '../../src/backend.js';
import { renderBoard } from '../../src/views/board.js';

const SAMPLE_SPECS: SpecSummary[] = [
  { name: 'user-auth', status: 'in-progress', progress: '3/5', blockedBy: null },
  { name: 'payment',   status: 'blocked',     progress: '2/8', blockedBy: 'IDP creds' },
  { name: 'reports',   status: 'planned',     progress: '0/3', blockedBy: null },
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
});
