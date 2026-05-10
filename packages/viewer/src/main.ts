import type { ZettelgeistBackend, ZettelgeistConfig } from './backend.js';
import { Router } from './router.js';
import { renderBoard } from './views/board.js';

function applyTheme(config: ZettelgeistConfig | undefined): void {
  const requested = config?.theme ?? 'system';
  let resolved: 'light' | 'dark';
  if (requested === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    resolved = requested;
  }
  document.documentElement.setAttribute('data-theme', resolved);
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
  // Detail view added in Task 11
  router.start();
}

bootstrap().catch((err) => {
  console.error('viewer bootstrap failed:', err);
});
