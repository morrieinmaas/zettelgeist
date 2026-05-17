export * from './types.js';
export type { FsReader } from './loader.js';
export { parseFrontmatter } from './frontmatter.js';
export type { FrontmatterResult } from './frontmatter.js';
export { parseTasks } from './tasks.js';
export { mergeTasksMd } from './merge-tasks.js';
export { mergeFrontmatter } from './merge-frontmatter.js';
export { loadSpec, loadAllSpecs, scanClaimedSpecs, sanitizeAgentId, defaultAgentId } from './loader.js';
export { deriveStatus } from './status.js';
export { buildGraph } from './graph.js';
export { validateRepo, compareErrors } from './validate.js';
export { regenerateIndex } from './regen.js';
export { loadConfig } from './config.js';
export type { ZettelgeistConfig, LoadConfigResult } from './config.js';

import type { FsReader } from './loader.js';
import type { Graph, RepoState, Status, ValidationError } from './types.js';
import { loadAllSpecs, scanClaimedSpecs } from './loader.js';
import { deriveStatus } from './status.js';
import { buildGraph } from './graph.js';
import { validateRepo, compareErrors } from './validate.js';
import { regenerateIndex } from './regen.js';
import { loadConfig } from './config.js';

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

  const cfg = await loadConfig(fs);
  const specsDir = cfg.config.specsDir;

  const specs = await loadAllSpecs(fs, specsDir);
  const claimedSpecs = await scanClaimedSpecs(fs, specsDir);
  const repoState: RepoState = { claimedSpecs, mergedSpecs: new Set() };
  const validation = await validateRepo(fs, specsDir);
  const graph = buildGraph(specs);

  const statuses: Record<string, Status> = {};
  for (const s of specs) statuses[s.name] = deriveStatus(s, repoState);

  const indexPath = `${specsDir}/INDEX.md`;
  let existingIndex: string | null = null;
  if (await fs.exists(indexPath)) {
    existingIndex = await fs.readFile(indexPath);
  }
  const index = regenerateIndex(specs, repoState, existingIndex);

  const errors = [...cfg.errors, ...validation.errors].sort(compareErrors);

  return {
    statuses: { specs: statuses },
    graph: { nodes: graph.nodes, edges: graph.edges, cycles: graph.cycles },
    validation: { errors },
    index,
  };
}
