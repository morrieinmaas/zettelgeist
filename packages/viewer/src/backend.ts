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
  readDoc(path: string): Promise<{ rendered: string; metadata: { title: string } }>;

  // mutate (each produces one git commit)
  writeSpecFile(name: string, relpath: string, content: string): Promise<{ commit: string }>;
  tickTask(name: string, n: number): Promise<{ commit: string }>;
  untickTask(name: string, n: number): Promise<{ commit: string }>;
  setStatus(
    name: string,
    status: Status | null,
    reason?: string,
  ): Promise<{ commit: string }>;
  writeHandoff(name: string, content: string): Promise<{ commit: string }>;
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
