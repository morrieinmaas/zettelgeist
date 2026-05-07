export * from './types.js';
export type { FsReader } from './loader.js';
export { parseFrontmatter } from './frontmatter.js';
export type { FrontmatterResult } from './frontmatter.js';
export { parseTasks } from './tasks.js';
export { loadSpec, loadAllSpecs } from './loader.js';
export { deriveStatus } from './status.js';
export { buildGraph } from './graph.js';
export { validateRepo } from './validate.js';
export { regenerateIndex } from './regen.js';

import type { FsReader } from './loader.js';
import type { Graph, RepoState, Status, ValidationError } from './types.js';
import { loadAllSpecs } from './loader.js';
import { deriveStatus } from './status.js';
import { buildGraph } from './graph.js';
import { validateRepo } from './validate.js';
import { regenerateIndex } from './regen.js';

export interface ConformanceOutput {
  statuses: { specs: Record<string, Status> };
  graph: { nodes: Graph['nodes']; edges: Graph['edges']; cycles: Graph['cycles'] };
  validation: { errors: ValidationError[] };
  index: string;
}

export async function runConformance(fs: FsReader): Promise<ConformanceOutput> {
  if (!(await fs.exists('.zettelgeist.yaml'))) {
    throw new Error('not a zettelgeist repo (missing .zettelgeist.yaml)');
  }

  const specs = await loadAllSpecs(fs);
  const repoState: RepoState = { claimedSpecs: new Set(), mergedSpecs: new Set() };
  const validation = await validateRepo(fs);
  const graph = buildGraph(specs);

  const statuses: Record<string, Status> = {};
  for (const s of specs) statuses[s.name] = deriveStatus(s, repoState);

  let existingIndex: string | null = null;
  if (await fs.exists('specs/INDEX.md')) {
    existingIndex = await fs.readFile('specs/INDEX.md');
  }
  const index = regenerateIndex(specs, repoState, existingIndex);

  return {
    statuses: { specs: statuses },
    graph: { nodes: graph.nodes, edges: graph.edges, cycles: graph.cycles },
    validation: { errors: validation.errors },
    index,
  };
}
