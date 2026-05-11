import type { SpecSummary } from '../backend.js';
import { fetchAndRenderValidationBanner } from '../components/validation-banner.js';
import { escapeHtml as escapeHtmlSafe } from '../util/sanitize.js';

interface GraphData {
  specs: SpecSummary[];
  edges: Array<{ from: string; to: string }>;
}

interface MermaidApi {
  render: (id: string, src: string) => Promise<{ svg: string }>;
}

interface MermaidModule {
  default: { initialize: (cfg: unknown) => void; render: MermaidApi['render'] };
}
let mermaidModule: MermaidModule | null = null;

async function loadMermaid(): Promise<MermaidApi> {
  // Lazy-imported so the Mermaid bundle (~hundreds of KB) is only fetched
  // when the graph view is opened. esbuild emits this as a separate chunk.
  if (!mermaidModule) {
    mermaidModule = (await import('mermaid')) as unknown as MermaidModule;
  }
  const mermaid = mermaidModule.default;
  // Re-initialize on every render so the theme toggle picks up immediately.
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    // Mermaid's default htmlLabels emit <foreignObject> with HTML children,
    // which DOMPurify's SVG profile strips — leaving empty node boxes. Native
    // SVG <text> labels render fine through the sanitizer.
    flowchart: { htmlLabels: false },
  });
  return mermaid as unknown as MermaidApi;
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

  const banner = await fetchAndRenderValidationBanner();
  if (banner) app.appendChild(banner);

  const wrapper = document.createElement('div');
  wrapper.className = 'zg-graph';

  const heading = document.createElement('h2');
  heading.textContent = 'Dependency Graph';
  wrapper.appendChild(heading);

  if (specs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zg-empty-state';
    const h = document.createElement('h3');
    h.textContent = 'No specs to graph';
    empty.appendChild(h);
    const p = document.createElement('p');
    p.textContent = 'Once specs exist, depends_on edges between them are rendered here.';
    empty.appendChild(p);
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
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render('zg-graph-svg', mermaidSrc);
    // Trust Mermaid's output directly. Reasoning:
    //  - Mermaid runs with securityLevel: 'strict' which sanitizes user input
    //    and refuses to render HTML / scripts in labels.
    //  - The input source (`graph TD ...`) is generated from spec names that
    //    the format spec restricts to slug-like identifiers — no user-supplied
    //    HTML reaches Mermaid in the first place.
    //  - Running DOMPurify a second time over Mermaid's SVG was stripping
    //    text-related attributes (`text-anchor`, `dominant-baseline`,
    //    `font-*`, `<tspan>` content positioning), leaving empty node boxes.
    container.innerHTML = svg;

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
