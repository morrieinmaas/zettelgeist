// The interface every host (zettelgeist serve REST, VSCode webview postMessage,
// future hosted views) implements. The viewer talks only to this.

export type Status =
  | 'draft'
  | 'planned'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'blocked'
  | 'cancelled';

export interface SpecSummary {
  name: string;
  status: Status;
  progress: string;     // e.g. "3/5"
  blockedBy: string | null;
  // The explicit `status:` override in frontmatter, or null if status is
  // derived. The edit modal uses this to pre-select "(auto)" vs an override.
  frontmatterStatus: Status | null;
  pr: string | null;        // PR URL from frontmatter
  branch: string | null;    // working branch from frontmatter
  worktree: string | null;  // path to git worktree from frontmatter
}

export interface Task {
  index: number;
  checked: boolean;
  text: string;
  tags: string[];       // '#human-only' | '#agent-only' | '#skip'
}

export interface SpecDetail {
  name: string;
  frontmatter: Record<string, unknown>;
  requirements: string | null;
  tasks: Task[];
  handoff: string | null;
  lenses: Record<string, string>;
}

export interface ValidationError {
  code: 'E_CYCLE' | 'E_INVALID_FRONTMATTER' | 'E_EMPTY_SPEC';
  path: string | string[];
  detail?: string;
}

export interface DocEntry {
  path: string;        // relative path from repo root, e.g. "docs/foo.md"
  title: string;
}

export interface ZettelgeistBackend {
  // read
  listSpecs(): Promise<SpecSummary[]>;
  readSpec(name: string): Promise<SpecDetail>;
  readSpecFile(name: string, relpath: string): Promise<{ content: string }>;
  validateRepo(): Promise<{ errors: ValidationError[] }>;
  listDocs(): Promise<DocEntry[]>;
  readDoc(path: string): Promise<{ source: string; metadata: { title: string } }>;
  writeDoc(path: string, content: string): Promise<{ commit: string }>;
  /** Rename or move a doc file. Both paths must be inside the workspace. */
  renameDoc(oldPath: string, newPath: string): Promise<{ commit: string; newPath: string }>;

  // mutate (each produces one git commit)
  writeSpecFile(name: string, relpath: string, content: string): Promise<{ commit: string }>;
  tickTask(name: string, n: number): Promise<{ commit: string }>;
  untickTask(name: string, n: number): Promise<{ commit: string }>;
  setStatus(
    name: string,
    status: Status | null,
    reason?: string,
  ): Promise<{ commit: string }>;
  // Merge a frontmatter patch into requirements.md. Keys with value `null`
  // are deleted; everything else is set. Status is intentionally not editable
  // via this endpoint — use setStatus.
  patchFrontmatter(
    name: string,
    patch: Record<string, unknown>,
  ): Promise<{ commit: string }>;
  writeHandoff(name: string, content: string): Promise<{ commit: string }>;
  /** Permanently delete a spec (its whole directory + INDEX.md regen). */
  deleteSpec(name: string): Promise<{ commit: string }>;
  regenerateIndex(): Promise<{ commit: string | null }>;

  // claim (no commit; .claim file is gitignored)
  claimSpec(name: string, agentId?: string): Promise<{ acknowledged: true }>;
  releaseSpec(name: string): Promise<{ acknowledged: true }>;
}

export interface ZettelgeistConfig {
  theme: 'light' | 'dark' | 'system';
}

declare global {
  interface Window {
    zettelgeistBackend: ZettelgeistBackend;
    zettelgeistConfig?: ZettelgeistConfig;
  }
}
