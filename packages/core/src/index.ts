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
import type { Graph, Status, ValidationError } from './types.js';

export interface ConformanceOutput {
  statuses: { specs: Record<string, Status> };
  graph: { nodes: Graph['nodes']; edges: Graph['edges']; cycles: Graph['cycles'] };
  validation: { errors: ValidationError[] };
  index: string;
}

const EMPTY_INDEX =
  '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->\n' +
  '\n' +
  '## State\n' +
  '\n' +
  '_No specs._\n' +
  '\n' +
  '## Graph\n' +
  '\n' +
  '_No specs._\n';

export async function runConformance(fs: FsReader): Promise<ConformanceOutput> {
  // Verify .zettelgeist.yaml exists; later tasks parse it and walk specs/.
  if (!(await fs.exists('.zettelgeist.yaml'))) {
    throw new Error('not a zettelgeist repo');
  }
  return {
    statuses: { specs: {} },
    graph: { nodes: [], edges: [], cycles: [] },
    validation: { errors: [] },
    index: EMPTY_INDEX,
  };
}
