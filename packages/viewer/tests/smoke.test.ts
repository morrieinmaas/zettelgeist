import { describe, expect, it, beforeEach } from 'vitest';
import type { ZettelgeistBackend } from '../src/backend.js';

describe('viewer smoke', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"><p>Loading…</p></main>';
    // Cast to a record so we can delete required global properties for the test.
    delete (window as unknown as Record<string, unknown>).zettelgeistBackend;
    delete (window as unknown as Record<string, unknown>).zettelgeistConfig;
  });

  it('shows an error when backend is missing', async () => {
    // Dynamic import so the module's bootstrap call sees our DOM + missing backend
    await import('../src/main.js').catch(() => {
      // bootstrap throws when backend is missing; that's expected here
    });
    // Wait a microtask for the bootstrap to run
    await new Promise((r) => setTimeout(r, 10));
    const app = document.getElementById('app')!;
    expect(app.innerHTML).toContain('zettelgeistBackend');
  });

  it('exports the backend interface as a type', () => {
    // Type-only assertion: if this compiles, the type is exported correctly.
    const _: ZettelgeistBackend | undefined = undefined;
    expect(_).toBeUndefined();
  });
});
