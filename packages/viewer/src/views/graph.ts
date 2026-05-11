import type { SpecSummary, Status } from '../backend.js';
import { fetchAndRenderValidationBanner } from '../components/validation-banner.js';
import { escapeHtml as escapeHtmlSafe } from '../util/sanitize.js';

interface MermaidApi {
  render: (id: string, src: string) => Promise<{ svg: string }>;
}

interface MermaidModule {
  default: { initialize: (cfg: unknown) => void; render: MermaidApi['render'] };
}
let mermaidModule: MermaidModule | null = null;

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModule) {
    mermaidModule = (await import('mermaid')) as unknown as MermaidModule;
  }
  const mermaid = mermaidModule.default;
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    // htmlLabels: false → native SVG <text> labels (sanitizer-friendly,
    // and lets our newline-in-label trick work for "name + progress").
    flowchart: { htmlLabels: false, curve: 'basis' },
  });
  return mermaid as unknown as MermaidApi;
}

interface SpecMeta {
  partOf: string | null;
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

  // Pull each spec's depends_on + part_of from frontmatter. N+1 calls is fine
  // for v0.1; future: backend exposes the graph in one shot.
  const edges: Array<{ from: string; to: string }> = [];
  const meta = new Map<string, SpecMeta>();
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
      const partOf = typeof spec.frontmatter.part_of === 'string' ? spec.frontmatter.part_of : null;
      meta.set(summary.name, { partOf });
    } catch {
      meta.set(summary.name, { partOf: null });
    }
  }

  app.innerHTML = '';

  const banner = await fetchAndRenderValidationBanner();
  if (banner) app.appendChild(banner);

  const wrapper = document.createElement('div');
  wrapper.className = 'zg-graph';

  const heading = document.createElement('div');
  heading.className = 'zg-graph-header';
  const h2 = document.createElement('h2');
  h2.textContent = 'Dependency Graph';
  heading.appendChild(h2);
  const sub = document.createElement('p');
  sub.className = 'zg-graph-subtitle';
  sub.textContent =
    'Each box is a spec — its color is the status, the number underneath is task progress. ' +
    'Arrows point from a spec to a spec it depends on. Click any box to open it. ' +
    'Dashed enclosures group specs by their `part_of` field (e.g. an epic or product area).';
  heading.appendChild(sub);
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

  wrapper.appendChild(renderLegend(specs));

  const mermaidSrc = renderMermaidSource(specs, edges, meta);
  const container = document.createElement('div');
  container.className = 'zg-graph-container';
  wrapper.appendChild(container);
  app.appendChild(wrapper);

  // Sweep stray Mermaid render leftovers (theme toggle, re-renders).
  document.querySelectorAll('[id^="dzg-graph-svg"], [id^="zg-graph-svg"]').forEach((el) => {
    if (!container.contains(el)) el.remove();
  });
  const renderId = `zg-graph-svg-${Date.now()}`;

  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(renderId, mermaidSrc);
    container.innerHTML = svg;
    document.querySelectorAll(`#d${renderId}, #${renderId}`).forEach((el) => {
      if (!container.contains(el)) el.remove();
    });

    // Click-to-navigate. We stored the original spec name in data-spec on each
    // node via a class trick — but Mermaid doesn't preserve data attrs. So we
    // map the node's internal id back to a spec name via the id we generated.
    const idToName = new Map<string, string>();
    for (const s of specs) idToName.set(nodeId(s.name), s.name);
    container.querySelectorAll<SVGGElement>('g.node').forEach((node) => {
      const id = node.id;  // Mermaid composes ids like "flowchart-<our-id>-<n>"
      const matchedName = [...idToName.entries()].find(([nid]) => id.includes(nid))?.[1];
      if (!matchedName) return;
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => {
        window.location.hash = `#/spec/${encodeURIComponent(matchedName)}`;
      });
    });
  } catch (err) {
    container.innerHTML =
      `<pre class="zg-graph-fallback">${escapeMermaidSrcForDisplay(mermaidSrc)}</pre>` +
      `<p class="zg-error">Could not render Mermaid graph: ${escapeHtmlSafe((err as Error).message)}. Showing source.</p>`;
  }
}

function renderLegend(specs: SpecSummary[]): HTMLElement {
  const present = new Set<Status>();
  for (const s of specs) present.add(s.status);

  const legend = document.createElement('div');
  legend.className = 'zg-graph-legend';
  const items: Array<{ s: Status; label: string }> = [
    { s: 'draft',       label: 'Draft' },
    { s: 'planned',     label: 'Planned' },
    { s: 'in-progress', label: 'In Progress' },
    { s: 'in-review',   label: 'In Review' },
    { s: 'done',        label: 'Done' },
    { s: 'blocked',     label: 'Blocked' },
    { s: 'cancelled',   label: 'Cancelled' },
  ];
  for (const { s, label } of items) {
    if (!present.has(s)) continue;
    const item = document.createElement('span');
    item.className = 'zg-legend-item';
    const swatch = document.createElement('span');
    swatch.className = `zg-legend-swatch zg-legend-${s}`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  }
  return legend;
}

function renderMermaidSource(
  specs: SpecSummary[],
  edges: Array<{ from: string; to: string }>,
  meta: Map<string, SpecMeta>,
): string {
  // Group specs by part_of. Specs with no part_of go in a fallthrough group
  // rendered at the top level (no enclosing subgraph).
  const groups = new Map<string, SpecSummary[]>();
  const ungrouped: SpecSummary[] = [];
  for (const s of specs) {
    const part = meta.get(s.name)?.partOf ?? null;
    if (!part) {
      ungrouped.push(s);
      continue;
    }
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part)!.push(s);
  }

  const lines: string[] = ['graph TD'];

  // Ungrouped specs first
  for (const s of ungrouped) lines.push(`  ${emitNode(s)}`);

  // Then one subgraph per part_of. Title is prefixed with a folder glyph so
  // users immediately read it as a grouping rather than a node. Each cluster
  // also gets a distinct background tint (deterministic from the part_of name)
  // so multiple clusters are visually separable at a glance.
  let sgIdx = 0;
  const clusterStyles: string[] = [];
  for (const [part, members] of groups) {
    const sgId = `sg_${sgIdx++}`;
    lines.push(`  subgraph ${sgId} ["📁 ${escapeForLabel(part)}"]`);
    for (const s of members) lines.push(`    ${emitNode(s)}`);
    lines.push('  end');
    const [fill, stroke] = clusterPalette(part);
    // Deferred to after edges + node classes so subgraph styles aren't
    // accidentally clobbered by Mermaid's classDef ordering quirks.
    clusterStyles.push(`style ${sgId} fill:${fill},stroke:${stroke},stroke-dasharray:4 4`);
  }

  // Edges
  for (const e of edges) lines.push(`  ${nodeId(e.from)} --> ${nodeId(e.to)}`);

  // Status colors. Mermaid classDef IDs can't have `-`, so map dashes → underscores.
  // Colors mirror the kanban card accents so the two views feel related.
  const palette: Array<[Status, string, string, string]> = [
    // [status, fill, stroke, text-color]
    ['draft',       '#f3f4f6', '#9ca3af', '#374151'],
    ['planned',     '#dbeafe', '#60a5fa', '#1e3a8a'],
    ['in-progress', '#fef3c7', '#f59e0b', '#78350f'],
    ['in-review',   '#ede9fe', '#8b5cf6', '#4c1d95'],
    ['done',        '#d1fae5', '#10b981', '#064e3b'],
    ['blocked',     '#fee2e2', '#c0392b', '#7f1d1d'],
    ['cancelled',   '#f3f4f6', '#7f8c8d', '#374151'],
  ];
  for (const [status, fill, stroke, color] of palette) {
    lines.push(`classDef ${statusClass(status)} fill:${fill},stroke:${stroke},color:${color},stroke-width:1.5px`);
  }

  // Apply the class to each node. `class A,B,C status_in_progress;` is the
  // Mermaid syntax for assigning a classDef to a list of node ids.
  const byStatus = new Map<Status, string[]>();
  for (const s of specs) {
    if (!byStatus.has(s.status)) byStatus.set(s.status, []);
    byStatus.get(s.status)!.push(nodeId(s.name));
  }
  for (const [status, ids] of byStatus) {
    lines.push(`class ${ids.join(',')} ${statusClass(status)}`);
  }

  // Apply the deferred cluster styles last so they win over any earlier
  // classDef rules that might also target the cluster's child nodes.
  for (const s of clusterStyles) lines.push(s);

  return lines.join('\n');
}

// Distinct, low-saturation cluster backgrounds. Deterministic per name so
// the same epic keeps the same color across renders. Hex-with-alpha rather
// than rgba() — Mermaid splits style directives on commas, so any
// `fill:rgba(r, g, b, a)` value gets shredded mid-parse and the render
// throws, falling back to raw-source display.
const CLUSTER_PALETTE: Array<[string, string]> = [
  ['#60a5fa1a', '#60a5fa8c'],  // blue
  ['#f59e0b1a', '#f59e0b8c'],  // amber
  ['#8b5cf61a', '#8b5cf68c'],  // violet
  ['#10b9811a', '#10b9818c'],  // emerald
  ['#ec48991a', '#ec48998c'],  // pink
  ['#f472b61a', '#f472b68c'],  // rose
  ['#38bdf81a', '#38bdf88c'],  // sky
];
function clusterPalette(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % CLUSTER_PALETTE.length;
  return CLUSTER_PALETTE[idx]!;
}

function emitNode(s: SpecSummary): string {
  // Two-line label: spec name + progress. \n in Mermaid label syntax = literal
  // newline when htmlLabels: false.
  const label = `${s.name}\\n${s.progress}`;
  return `${nodeId(s.name)}["${escapeForLabel(label)}"]`;
}

function nodeId(name: string): string {
  // Spec names follow the format spec's slug rule (lowercase + dashes), so
  // they're already valid Mermaid identifiers — but normalize defensively.
  return `n_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function statusClass(s: Status): string {
  return `s_${s.replace(/-/g, '_')}`;
}

function escapeForLabel(s: string): string {
  // Mermaid labels: escape `"` to avoid breaking out of the bracket-quoted form.
  // We intentionally don't escape `\n` — we want it to be a literal escape sequence.
  return s.replace(/"/g, '\\"');
}

function escapeMermaidSrcForDisplay(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}
