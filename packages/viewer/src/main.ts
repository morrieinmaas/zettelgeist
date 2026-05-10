import type { ZettelgeistBackend, ZettelgeistConfig } from './backend.js';
import { Router } from './router.js';
import { renderBoard } from './views/board.js';
import { renderDetail } from './views/detail.js';
import { renderGraph } from './views/graph.js';
import { renderDocs } from './views/docs.js';

function applyTheme(config: ZettelgeistConfig | undefined): void {
  const requested = config?.theme ?? 'system';
  const apply = (resolved: 'light' | 'dark'): void => {
    document.documentElement.setAttribute('data-theme', resolved);
  };
  if (requested === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', (e) => apply(e.matches ? 'dark' : 'light'));
  } else {
    apply(requested);
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

  applyTheme(window.zettelgeistConfig);

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
