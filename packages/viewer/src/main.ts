import type { ZettelgeistBackend, ZettelgeistConfig } from './backend.js';

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

  const app = document.getElementById('app')!;
  app.innerHTML = '<p>Viewer ready. Board, detail, graph, and docs views land in subsequent tasks.</p>';

  // Subsequent tasks will replace this with router + view rendering.
}

bootstrap().catch((err) => {
  console.error('viewer bootstrap failed:', err);
});
