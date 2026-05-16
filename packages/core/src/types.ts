export type Status =
  | 'draft'
  | 'planned'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'blocked'
  | 'cancelled';

export interface Task {
  /** 1-indexed position in tasks.md */
  index: number;
  checked: boolean;
  text: string;
  tags: ReadonlyArray<'#human-only' | '#agent-only' | '#skip'>;
}

export interface SpecFrontmatter {
  /**
   * Explicit override for derived status. Any of the 7 values; if unset,
   * status is derived from tasks + claim + merge state.
   */
  status?: Status;
  blocked_by?: string;
  depends_on?: string[];
  part_of?: string;
  replaces?: string;
  merged_into?: string;
  auto_merge?: boolean;
  /** Any other fields are preserved but not interpreted. */
  [key: string]: unknown;
}

export interface Spec {
  name: string;
  frontmatter: SpecFrontmatter;
  requirements: string | null;
  tasks: ReadonlyArray<Task>;
  handoff: string | null;
  lenses: ReadonlyMap<string, string>;
}

export interface RepoState {
  /**
   * Spec names that have any claim present. Format-version 0.1 used a
   * single `.claim` file per spec; 0.2 introduces per-actor `.claim-<id>`
   * files to avoid merge conflicts when two machines claim concurrently.
   * Both shapes are recognised on read; `scanClaimedSpecs()` populates this.
   */
  claimedSpecs: ReadonlySet<string>;
  /** Spec names whose changes are merged to the default branch. */
  mergedSpecs: ReadonlySet<string>;
}

export type ValidationError =
  | { code: 'E_CYCLE'; path: string[] }
  | { code: 'E_INVALID_FRONTMATTER'; path: string; detail: string }
  | { code: 'E_EMPTY_SPEC'; path: string };

export interface GraphNode {
  name: string;
  partOf: string | null;
}

export interface GraphEdge {
  /** depends_on edge: from → to means `from` depends on `to`. */
  from: string;
  to: string;
}

export interface Graph {
  nodes: ReadonlyArray<GraphNode>;
  edges: ReadonlyArray<GraphEdge>;
  /** Reverse `depends_on` edges, derived. */
  blocks: ReadonlyArray<GraphEdge>;
  /** Each cycle is an ordered list of spec names; the cycle closes back to the first. */
  cycles: ReadonlyArray<string[]>;
}
