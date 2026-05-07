import { buildGraph } from './graph.js';
import { deriveStatus } from './status.js';
import type { RepoState, Spec } from './types.js';

const MARKER = '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->';

export function regenerateIndex(
  specs: ReadonlyArray<Spec>,
  repoState: RepoState,
  existingIndex: string | null,
): string {
  const human = extractHumanRegion(existingIndex);
  const auto = renderAutoRegion(specs, repoState);
  if (human === '') return `${MARKER}\n\n${auto}`;
  return `${human}\n\n${MARKER}\n\n${auto}`;
}

function extractHumanRegion(existing: string | null): string {
  if (existing === null || existing === '') return '';
  const idx = existing.indexOf(MARKER);
  if (idx === -1) return existing.replace(/\n+$/, '');
  return existing.slice(0, idx).replace(/\n+$/, '');
}

function renderAutoRegion(specs: ReadonlyArray<Spec>, repoState: RepoState): string {
  if (specs.length === 0) {
    return '## State\n\n_No specs._\n\n## Graph\n\n_No specs._\n';
  }
  return `${renderStateTable(specs, repoState)}\n${renderGraphBlock(specs)}`;
}

function renderStateTable(specs: ReadonlyArray<Spec>, repoState: RepoState): string {
  const sorted = [...specs].sort((a, b) => a.name.localeCompare(b.name));
  const rows = sorted.map((s) => {
    const status = deriveStatus(s, repoState);
    const progress = renderProgress(s);
    const blockedBy = renderBlockedBy(s);
    return `| ${s.name} | ${status} | ${progress} | ${blockedBy} |`;
  });
  return [
    '## State',
    '',
    '| Spec | Status | Progress | Blocked by |',
    '|------|--------|----------|------------|',
    ...rows,
    '',
  ].join('\n');
}

function renderProgress(spec: Spec): string {
  const counted = spec.tasks.filter((t) => !t.tags.includes('#skip'));
  const checked = counted.filter((t) => t.checked).length;
  return `${checked}/${counted.length}`;
}

function renderBlockedBy(spec: Spec): string {
  const v = spec.frontmatter.blocked_by;
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return '—';
}

function renderGraphBlock(specs: ReadonlyArray<Spec>): string {
  const graph = buildGraph(specs);
  const lines = ['## Graph', '', '```mermaid', 'graph TD'];
  for (const node of graph.nodes) lines.push(`  ${node.name}`);
  for (const edge of graph.edges) lines.push(`  ${edge.from} --> ${edge.to}`);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}
