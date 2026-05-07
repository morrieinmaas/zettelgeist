import type { Graph, GraphEdge, GraphNode, Spec } from './types.js';

export function buildGraph(specs: ReadonlyArray<Spec>): Graph {
  const nameSet = new Set(specs.map((s) => s.name));

  const nodes: GraphNode[] = specs
    .map((s) => ({
      name: s.name,
      partOf: typeof s.frontmatter.part_of === 'string' ? s.frontmatter.part_of : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const edges: GraphEdge[] = [];
  for (const s of specs) {
    const deps = s.frontmatter.depends_on;
    if (!Array.isArray(deps)) continue;
    const seen = new Set<string>();
    for (const d of deps) {
      if (typeof d !== 'string') continue;
      if (!nameSet.has(d)) continue;
      if (seen.has(d)) continue;
      seen.add(d);
      edges.push({ from: s.name, to: d });
    }
  }
  edges.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));

  const blocks: GraphEdge[] = edges
    .map((e) => ({ from: e.to, to: e.from }))
    .sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));

  const cycles = detectCycles(specs.map((s) => s.name).sort(), edges);

  return { nodes, edges, blocks, cycles };
}

function detectCycles(orderedNames: string[], edges: GraphEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of orderedNames) adj.set(n, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);
  for (const list of adj.values()) list.sort();

  const cycles: string[][] = [];
  const seen = new Set<string>(); // canonical-form cycle keys

  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string): void {
    visited.add(node);
    stack.push(node);
    onStack.add(node);
    for (const next of adj.get(node) ?? []) {
      if (onStack.has(next)) {
        const startIdx = stack.indexOf(next);
        const raw = stack.slice(startIdx);
        const canonical = canonicalize(raw);
        const key = canonical.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(canonical);
        }
      } else if (!visited.has(next)) {
        dfs(next);
      }
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const n of orderedNames) {
    if (!visited.has(n)) dfs(n);
  }

  cycles.sort((a, b) => a.join('|').localeCompare(b.join('|')));
  return cycles;
}

/** Rotate the cycle so the lexicographically smallest name is first. */
function canonicalize(cycle: string[]): string[] {
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i += 1) {
    if (cycle[i]! < cycle[minIdx]!) minIdx = i;
  }
  return cycle.slice(minIdx).concat(cycle.slice(0, minIdx));
}
