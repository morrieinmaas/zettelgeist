import type { SpecSummary } from '../backend.js';
import { sanitizeHtml, escapeHtml as escapeHtmlSafe } from '../util/sanitize.js';

interface GraphData {
  specs: SpecSummary[];
  edges: Array<{ from: string; to: string }>;
}

let mermaidLoaded = false;

async function loadMermaid(): Promise<void> {
  if (mermaidLoaded) return;
  // Mermaid is loaded via a <script> tag because their ESM CDN is volatile.
  // We import from a stable CDN at runtime; if it fails, render a graceful fallback.
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
      window.mermaid = mermaid;
      mermaid.initialize({ startOnLoad: false, theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default' });
      window.dispatchEvent(new Event('mermaid-ready'));
    `;
    window.addEventListener('mermaid-ready', () => resolve(), { once: true });
    setTimeout(() => reject(new Error('mermaid load timed out')), 10000);
    document.head.appendChild(script);
  });
  mermaidLoaded = true;
}

export async function renderGraph(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '<p>Loading graph…</p>';

  const backend = window.zettelgeistBackend;
  let specs: SpecSummary[];
  try {
    specs = await backend.listSpecs();
  } catch (err) {
    app.innerHTML = `<p class="zg-error">Failed to load: ${escapeHtmlSafe((err as Error).message)}</p>`;
    return;
  }

  // Fetch each spec's depends_on from frontmatter (via readSpec).
  // For v0.1 simplicity, this is N+1 calls; future: backend can expose graph directly.
  const edges: Array<{ from: string; to: string }> = [];
  for (const summary of specs) {
    try {
      const spec = await backend.readSpec(summary.name);
      const deps = spec.frontmatter.depends_on;
      if (Array.isArray(deps)) {
        for (const dep of deps) {
          if (typeof dep === 'string' && specs.some((s) => s.name === dep)) {
            edges.push({ from: summary.name, to: dep });
          }
        }
      }
    } catch {
      // skip specs that fail to load
    }
  }

  app.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'zg-graph';

  const heading = document.createElement('h2');
  heading.textContent = 'Dependency Graph';
  wrapper.appendChild(heading);

  if (specs.length === 0) {
    const empty = document.createElement('p');
    empty.innerHTML = '<em>No specs yet.</em>';
    wrapper.appendChild(empty);
    app.appendChild(wrapper);
    return;
  }

  const mermaidSrc = renderMermaidSource({ specs, edges });
  const container = document.createElement('div');
  container.className = 'zg-graph-container';
  wrapper.appendChild(container);
  app.appendChild(wrapper);

  try {
    await loadMermaid();
    const mermaid = (window as Window & { mermaid?: { render: (id: string, src: string) => Promise<{ svg: string }> } }).mermaid;
    if (!mermaid) throw new Error('mermaid not loaded');
    const { svg } = await mermaid.render('zg-graph-svg', mermaidSrc);
    container.innerHTML = sanitizeHtml(svg);

    container.querySelectorAll<SVGElement>('.node').forEach((node) => {
      const label = node.querySelector('text')?.textContent;
      if (!label) return;
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => {
        window.location.hash = `#/spec/${encodeURIComponent(label)}`;
      });
    });
  } catch (err) {
    container.innerHTML = `<pre class="zg-graph-fallback">${escapeHtml(mermaidSrc)}</pre>` +
      `<p class="zg-error">Could not render Mermaid graph: ${escapeHtml((err as Error).message)}. Showing source.</p>`;
  }
}

function renderMermaidSource(data: GraphData): string {
  const lines = ['graph TD'];
  for (const spec of data.specs) lines.push(`  ${spec.name}`);
  for (const edge of data.edges) lines.push(`  ${edge.from} --> ${edge.to}`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}
