import type { ZettelgeistBackend, ZettelgeistConfig } from './backend.js';
import { Router } from './router.js';
import { renderBoard } from './views/board.js';
import { renderDetail } from './views/detail.js';
import { renderGraph } from './views/graph.js';
import { renderDocs } from './views/docs.js';

const THEME_STORAGE_KEY = 'zg.theme';

function resolveTheme(config: ZettelgeistConfig | undefined): 'light' | 'dark' {
  // localStorage (user toggle) wins over config (.zettelgeist.yaml's
  // viewer_theme) which wins over system preference.
  const stored = (() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
  })();
  if (stored === 'light' || stored === 'dark') return stored;

  const requested = config?.theme ?? 'system';
  if (requested === 'light' || requested === 'dark') return requested;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('zg-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}

function setupTheme(config: ZettelgeistConfig | undefined): void {
  let current = resolveTheme(config);
  applyTheme(current);

  // Follow system changes only when there's no explicit stored override.
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    try {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    } catch { /* ignore */ }
    current = e.matches ? 'dark' : 'light';
    applyTheme(current);
  });

  // Wire the navbar toggle. The button exists in index.html unconditionally;
  // hosts that ship their own index can omit it.
  const btn = document.getElementById('zg-theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      current = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_STORAGE_KEY, current); } catch { /* ignore */ }
      applyTheme(current);
      // Force a re-render so Mermaid picks up the new theme + cards repaint
      // with the right accent colors immediately.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }
}

async function bootstrap(): Promise<void> {
  const backend: ZettelgeistBackend | undefined = window.zettelgeistBackend;
  if (!backend) {
    document.getElementById('app')!.innerHTML =
      '<p>Error: <code>window.zettelgeistBackend</code> is not defined. ' +
      'The viewer must be loaded by a host that injects a backend.</p>';
    throw new Error('window.zettelgeistBackend is not defined');
  }

  setupTheme(window.zettelgeistConfig);

  const router = new Router();
  router.add('/', renderBoard);
  router.add('/spec/:name', renderDetail);
  router.add('/graph', renderGraph);
  router.add('/docs', renderDocs);
  router.add('/docs/*path', renderDocs);
  router.start();
}

bootstrap().catch((err) => {
  console.error('viewer bootstrap failed:', err);
});
