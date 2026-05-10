# Zettelgeist v0.1 — Plan 2: Viewer + Minimal CLI + MCP + Hook + CI

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` for tracking.

**Goal:** Ship the non-coder click surface (a local HTML viewer) plus the agent surface (MCP) plus operational glue (minimal CLI, pre-commit hook, CI). Storage stays markdown; humans interact via HTML; agents use MCP.

**Architecture:** pnpm-workspace monorepo. New packages: `fs-adapters/`, `viewer/`, `cli/`, `mcp-server/`. The viewer is host-agnostic — it talks only to a `window.zettelgeistBackend` interface. `zettelgeist serve` provides the REST host. Future hosts (VSCode webview, hosted views) reuse the same bundle.

**Reference design**: [`docs/superpowers/specs/2026-05-09-zettelgeist-v0.1-plan-2-design.md`](../specs/2026-05-09-zettelgeist-v0.1-plan-2-design.md). Read once before starting; then this plan is the operational checklist.

**Tech stack:**
- TypeScript 5.x strict, NodeNext, ES2022
- Vitest for tests; Playwright for viewer e2e
- `@modelcontextprotocol/sdk` (pin latest stable) + `zod` + `zod-to-json-schema`
- `marked` for markdown→HTML; `highlight.js` for code; `mermaid` (CDN-loaded) for graphs
- Pico.css (~10KB classless framework) for viewer base styling
- Node 20+ (`util.parseArgs`, `node:http`, `node:fs/promises`)

**Out of scope:** see design §3.

**Already done from previous Plan 2 (do not redo):**
- **Task 1**: `packages/fs-adapters/` skeleton — committed at `e08a9df` (`chore(fs-adapters): scaffold package`). Continue from Task 2.

---

## Phase 1 — `fs-adapters/` (Tasks 2–4)

### Task 2: `makeMemFsReader` + tests

Extracts duplicated `makeMemFs` from `packages/core/tests/{loader,validate}.test.ts`.

**Files:** Create `src/mem.ts`, `tests/mem.test.ts`. Update `src/index.ts` to uncomment the mem export.

**TDD:** Write `tests/mem.test.ts` with 7 tests covering `readDir` (root, nested), `readFile` (success, ENOENT), `exists` (file, dir-from-child, missing). Run, expect failure. Implement `mem.ts` with the function from the previous plan's Task 2 §3. Run, expect 7 pass.

```ts
// packages/fs-adapters/src/mem.ts
import type { FsReader } from '@zettelgeist/core';
export function makeMemFsReader(files: Record<string, string>): FsReader {
  const dirs = new Set<string>();
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  return {
    async readDir(path) {
      const prefix = path === '' ? '' : `${path}/`;
      const seen = new Set<string>();
      const out: Array<{ name: string; isDir: boolean }> = [];
      for (const f of Object.keys(files)) {
        if (!f.startsWith(prefix)) continue;
        const head = f.slice(prefix.length).split('/')[0];
        if (!head || seen.has(head)) continue;
        seen.add(head);
        out.push({ name: head, isDir: dirs.has(prefix + head) });
      }
      return out;
    },
    async readFile(path) {
      const v = files[path];
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async exists(path) { return path in files || dirs.has(path); },
  };
}
```

After implementation, update `src/index.ts`:
```ts
export { makeMemFsReader } from './mem.js';
// export { makeDiskFsReader } from './disk.js';  // Task 3
```

Run `pnpm --filter @zettelgeist/fs-adapters test` → 7 pass. `typecheck` clean.

**Commit:** `feat(fs-adapters): in-memory FsReader extracted from test helpers`

### Task 3: `makeDiskFsReader` + tests

Extracts the disk reader from `spec/conformance/harness/src/run.ts`.

**Files:** `src/disk.ts`, `tests/disk.test.ts`. Uncomment the disk export in `src/index.ts`.

```ts
// packages/fs-adapters/src/disk.ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { FsReader } from '@zettelgeist/core';
export function makeDiskFsReader(rootDir: string): FsReader {
  const r = (p: string) => path.join(rootDir, p);
  return {
    async readDir(p) {
      const entries = await fs.readdir(r(p), { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
    },
    async readFile(p) { return fs.readFile(r(p), 'utf8'); },
    async exists(p) { try { await fs.stat(r(p)); return true; } catch { return false; } },
  };
}
```

Tests use `fs.mkdtemp` for tmpdir; verify `readDir`, `readFile` (success + missing), `exists` (file, dir, missing). 5 tests.

**Commit:** `feat(fs-adapters): disk FsReader against tmpdir`

### Task 4: Migrate consumers

Replace duplicated helpers in `packages/core/tests/loader.test.ts`, `packages/core/tests/validate.test.ts`, `spec/conformance/harness/src/run.ts` with imports from `@zettelgeist/fs-adapters`.

For core's tests: add `@zettelgeist/fs-adapters` to `packages/core/package.json` `devDependencies`. Replace the 30-line `makeMemFs` block with one import:
```ts
import { makeMemFsReader as makeMemFs } from '@zettelgeist/fs-adapters';
```

For harness: add `@zettelgeist/fs-adapters` to `spec/conformance/harness/package.json` `dependencies`. Replace `src/run.ts` content with:
```ts
export { makeDiskFsReader } from '@zettelgeist/fs-adapters';
```

Update `spec/conformance/harness/vitest.config.ts` and `tsconfig.json` to add an alias/path for `@zettelgeist/fs-adapters` mirroring the existing `@zettelgeist/core` setup.

`pnpm install`, `pnpm -r test`, `pnpm conformance`, `pnpm -r typecheck` all green. Total: 64 unit + 12 fs-adapters + 11 conformance.

**Commit:** `refactor: migrate FsReader consumers to shared @zettelgeist/fs-adapters`

---

## Phase 2 — `cli/` scaffold (Tasks 5–8)

### Task 5: CLI package skeleton

**Files:** `packages/cli/package.json`, `tsconfig.json`, `tsconfig.build.json`, `src/bin.ts` (placeholder).

```json
{
  "name": "@zettelgeist/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "zettelgeist": "./dist/bin.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json && chmod +x dist/bin.js",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@zettelgeist/core": "workspace:*",
    "@zettelgeist/fs-adapters": "workspace:*"
  }
}
```

Mirror `tsconfig.json` and `tsconfig.build.json` from `core`. Stub `src/bin.ts` with `#!/usr/bin/env node\nconsole.log('zettelgeist v0.1');`.

`pnpm install`, `pnpm --filter @zettelgeist/cli build` → `dist/bin.js` exists, executable.

**Commit:** `chore(cli): scaffold package with bin entry`

### Task 6: `output.ts` (JSON envelope)

Same as the original Plan 2's Task 6: `okEnvelope`, `errorEnvelope`, `emit(ctx, env, humanRender)`. `realEmitContext(json)` factory. 5 unit tests.

**Commit:** `feat(cli): JSON envelope and emit helpers`

### Task 7: `router.ts` (subcommand routing on `parseArgs`)

Maps argv to invocations. **Five known commands** (not 10): `regen`, `validate`, `install-hook`, `serve`, `export-doc`. Plus `--help` (with optional command topic) and `unknown-command` outcomes.

Same shape as the original Plan 2's Task 7 but with the smaller command set. Flag options: `json`, `help`, `check`, `force`, `port`, `no-open`, `template`. 7 unit tests.

**Commit:** `feat(cli): subcommand router on Node parseArgs`

### Task 8: `git.ts` (subprocess helpers + smart-merge hook)

Same as original Plan 2's Task 8: `gitCommit`, `gitDefaultBranch`, `gitRepoRoot`, `installPreCommitHook(force)`, `mergeHookContent`. 4 unit tests for `mergeHookContent` (empty/null, idempotent, non-marker rejection, shebang-only append).

```ts
export const HOOK_BLOCK =
  '# >>> zettelgeist >>>\n' +
  'zettelgeist regen --check\n' +
  '# <<< zettelgeist <<<';
```

**Commit:** `feat(cli): git subprocess helpers + smart-merge hook installer`

---

## Phase 3 — `viewer/` (Tasks 9–15)

The centerpiece. Vanilla HTML/CSS/JS, no framework. Builds to a static bundle that the CLI ships.

### Task 9: Viewer package skeleton + backend interface

**Files:** `packages/viewer/package.json`, `tsconfig.json`, `tsconfig.build.json`, `src/backend.ts`, `src/main.ts`, `src/index.html`.

```json
{
  "name": "@zettelgeist/viewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "files": ["dist"],
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "marked": "^14.0.0",
    "highlight.js": "^11.10.0"
  },
  "devDependencies": {
    "@picocss/pico": "^2.0.0",
    "esbuild": "^0.24.0",
    "happy-dom": "^15.0.0"
  }
}
```

`scripts/build.mjs` uses esbuild to bundle `src/main.ts` → `dist/main.js`, copies `index.html` and CSS files into `dist/`. Lazy-loads mermaid via CDN at runtime.

`src/backend.ts` defines the `ZettelgeistBackend` interface (15 methods — see design §6.2). Pure type definitions, no implementation. Hosts inject `window.zettelgeistBackend` matching this shape.

`src/main.ts` reads `window.zettelgeistBackend`, throws clear error if missing, kicks off rendering.

`src/index.html` is the entry HTML — a single `<div id="app">`, link to bundled CSS, script tag for `main.js`.

```ts
// packages/viewer/src/backend.ts
export type Status =
  | 'draft' | 'planned' | 'in-progress' | 'in-review' | 'done' | 'blocked' | 'cancelled';

export interface SpecSummary { name: string; status: Status; progress: string; blockedBy: string | null; }
export interface SpecDetail { /* full shape per design §6.2 read_spec output */ }
export interface DocEntry { path: string; title: string; }
export interface ValidationError { /* same as core */ }

export interface ZettelgeistBackend {
  listSpecs(): Promise<SpecSummary[]>;
  readSpec(name: string): Promise<SpecDetail>;
  readSpecFile(name: string, relpath: string): Promise<{ content: string }>;
  writeSpecFile(name: string, relpath: string, content: string): Promise<{ commit: string }>;
  tickTask(name: string, n: number): Promise<{ commit: string }>;
  untickTask(name: string, n: number): Promise<{ commit: string }>;
  setStatus(name: string, status: 'blocked' | 'cancelled' | null, reason?: string): Promise<{ commit: string }>;
  claimSpec(name: string, agentId?: string): Promise<{ acknowledged: true }>;
  releaseSpec(name: string): Promise<{ acknowledged: true }>;
  writeHandoff(name: string, content: string): Promise<{ commit: string }>;
  regenerateIndex(): Promise<{ commit: string | null }>;
  validateRepo(): Promise<{ errors: ValidationError[] }>;
  listDocs(): Promise<DocEntry[]>;
  readDoc(path: string): Promise<{ rendered: string; metadata: { title: string } }>;
}

declare global { interface Window { zettelgeistBackend: ZettelgeistBackend; } }
```

Smoke test: `tests/smoke.test.ts` verifies the interface compiles and `main.ts` throws if backend is missing. 1 test.

**Commit:** `chore(viewer): scaffold package with backend interface`

### Task 10: Board view (Kanban columns + cards)

**Files:** `src/views/board.ts`, `src/components/card.ts`, `src/styles/base.css`, `src/styles/board.css`, `tests/views/board.test.ts`.

Renders 7 columns: Draft, Planned, In Progress, In Review, Done, Blocked, Cancelled. Each card shows: spec name, progress (`3/5`), blocked-by tooltip if set. Click card → emits a `spec-selected` event that opens the detail view (Task 11).

Mobile: at viewport < 768px, columns stack vertically with the column heading as a collapsible header.

CSS uses Pico.css for typography/spacing defaults, custom layer for Kanban grid:
```css
.board { display: grid; grid-template-columns: repeat(7, minmax(180px, 1fr)); gap: 1rem; overflow-x: auto; }
@media (max-width: 768px) {
  .board { grid-template-columns: 1fr; }
  .column { display: block; }
  .column-header { cursor: pointer; }
  .column-cards { display: none; }
  .column[open] .column-cards { display: block; }
}
```

Drag-and-drop wiring: cards are draggable. Drop targets are Blocked and Cancelled columns. Other columns reject the drop with a tooltip.

Tests use happy-dom: render the board with a mocked backend returning 3 specs across 3 statuses; assert DOM structure, click a card, assert event fired.

**Commit:** `feat(viewer): Kanban board view with mobile-responsive layout`

### Task 11: Spec detail view (tabs + edit forms)

**Files:** `src/views/detail.ts`, `src/components/{tabs,frontmatter-form,task-list,handoff-pane,lenses-pane}.ts`, `tests/views/detail.test.ts`.

Opens when a card is clicked or routed to `#/spec/<name>`. Four tabs: Requirements, Tasks, Handoff, Lenses (only shown if any lens files exist).

- **Requirements tab**: renders `requirements.md` body via `marked`. Frontmatter shown above as a form (read-only display + "Edit" button → form fields for `status` override, `blocked_by`, `depends_on` array). Save button calls `backend.writeSpecFile`.
- **Tasks tab**: list of tasks with checkboxes. Click checkbox → `backend.tickTask` or `untickTask`. `#human-only` / `#agent-only` / `#skip` tags rendered as small badges.
- **Handoff tab**: rendered markdown of `handoff.md` if present; "Edit" button → textarea + save → `backend.writeHandoff`.
- **Lenses tab**: tab strip per lens file; rendered markdown content per lens.

Tests: render with mocked backend returning a full SpecDetail; click checkbox; assert backend.tickTask called with right args. ~6 tests.

**Commit:** `feat(viewer): spec detail view with tabbed content + inline edits`

### Task 12: Drag-to-blocked/cancelled with reason modal

**Files:** `src/components/reason-modal.ts`, modify `src/views/board.ts`.

When a card is dropped on Blocked or Cancelled column: open modal with reason textarea (required for Blocked, optional for Cancelled), confirm button calls `backend.setStatus(name, 'blocked', reason)`. Drag OUT of those columns: emits a `setStatus(name, null)` immediately, no modal.

Drop on derived-status columns: rejected with toast/tooltip "Status is derived from tasks.md. Tick or untick tasks to change it."

Tests: mock backend, simulate drag events, assert modal opens with correct fields, assert setStatus called with right args. ~3 tests.

**Commit:** `feat(viewer): drag-to-blocked/cancelled with reason modal`

### Task 13: Graph view (Mermaid)

**Files:** `src/views/graph.ts`, `tests/views/graph.test.ts`.

Tab/route to `#/graph`. Lazy-loads `mermaid` from `https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs` only when this view is opened. Renders the same `graph TD` block from `INDEX.md` but with click handlers — clicking a node routes to that spec's detail view.

If the repo has a `part_of` grouping, render `subgraph` clusters for visual grouping.

Tests: smoke test that the graph view registers correctly and lazy-loads Mermaid. Real graph rendering is hard to unit-test; rely on Playwright e2e (Task 27) for the full path.

**Commit:** `feat(viewer): graph view with lazy-loaded Mermaid`

### Task 14: Docs view (rendered markdown)

**Files:** `src/views/docs.ts`, `tests/views/docs.test.ts`.

Tab/route to `#/docs`. Calls `backend.listDocs()` to get a tree of markdown files under `docs/` and the format spec. Click a file → `backend.readDoc(path)` returns rendered HTML (server renders via marked.js to keep client bundle small).

Sidebar tree of doc files; main pane renders the selected doc.

Tests: mock backend, click an entry, assert content rendered. ~2 tests.

**Commit:** `feat(viewer): docs view for rendered markdown navigation`

### Task 15: Theme support + viewer.css override

**Files:** `src/styles/light.css`, `src/styles/dark.css`, modify `src/main.ts` to load theme based on a global `window.zettelgeistConfig.theme` ('light' | 'dark' | 'system').

Theme is selected by:
1. Host injects `window.zettelgeistConfig = { theme: 'light' | 'dark' | 'system' }` before main.js loads
2. Main.js applies `data-theme="<theme>"` on `<html>`; CSS variables resolve accordingly
3. If 'system', listens to `prefers-color-scheme` media query

CSS override path: the host (e.g., `serve`'s HTTP server) serves `.zettelgeist/render-templates/viewer.css` if it exists, after the bundled CSS. Cascade does the rest.

Tests: smoke test that theme switching swaps the data-theme attribute. ~2 tests.

**Commit:** `feat(viewer): light/dark themes + viewer.css override hook`

---

## Phase 4 — CLI commands (Tasks 16–20)

### Task 16: `regen` command + cache via git tree SHA

**Files:** `packages/cli/src/commands/regen.ts`, `packages/cli/tests/regen.test.ts`. Modify `.gitignore` to add `.zettelgeist/regen-cache.json` and `.zettelgeist/exports/`.

Combines original Plan 2's Task 9 (regen) and Task 9b (cache) into one task. The regen function:

1. Verify `.zettelgeist.yaml` exists.
2. Get specs tree SHA via `git rev-parse HEAD:<specs_dir>`.
3. Read cache at `.zettelgeist/regen-cache.json`. If `tree_sha` matches, use cached content.
4. Else: run `core.runConformance`, write cache.
5. Compare to on-disk INDEX.md; write if changed (atomic temp+rename); return `{changed, path, cacheHit}` or `--check` returns error if stale.

8 tests: 4 for basic regen behavior (write missing, no-op when current, --check ok, --check stale), 4 for cache (writes cache, reuses on hit, regenerates on tree change, no-op in non-git dir).

**Commit:** `feat(cli): regen command with content-aware cache via git tree SHA`

### Task 17: `validate` command

**Files:** `src/commands/validate.ts`, `tests/validate.test.ts`. ~30 LOC: load config, run `validateRepo`, merge errors, return ok envelope or error envelope with `detail.errors[]`. 2 tests.

**Commit:** `feat(cli): validate command`

### Task 18: `install-hook` command

**Files:** `src/commands/install-hook.ts`, `tests/install-hook.test.ts`. Wraps `installPreCommitHook(repoRoot, {force})` from `git.ts`. 5 tests covering: clean install, idempotent re-run, reject non-marker without --force, --force with backup, executable bit set.

**Commit:** `feat(cli): install-hook command`

### Task 19: `serve` command — local HTTP server hosting the viewer

**Files:** `packages/cli/src/commands/serve.ts`, `packages/cli/src/server.ts` (the actual HTTP server), `packages/cli/tests/serve.test.ts`.

Critical task. The HTTP server implements the `ZettelgeistBackend` interface as REST endpoints, plus serves the viewer bundle (copied from `packages/viewer/dist/` at build time into `packages/cli/viewer-bundle/`).

**Endpoints:**

```
GET   /                              → index.html (viewer entry)
GET   /static/*                      → viewer assets (CSS, JS, fonts)
GET   /api/specs                     → backend.listSpecs()
GET   /api/specs/:name               → backend.readSpec(name)
GET   /api/specs/:name/files/:path*  → backend.readSpecFile(name, path)
PUT   /api/specs/:name/files/:path*  → backend.writeSpecFile(name, path, body)
POST  /api/specs/:name/tasks/:n/tick     → backend.tickTask(name, n)
POST  /api/specs/:name/tasks/:n/untick   → backend.untickTask(name, n)
POST  /api/specs/:name/status        → backend.setStatus(name, body.status, body.reason)
POST  /api/specs/:name/claim         → backend.claimSpec(name, body.agentId)
POST  /api/specs/:name/release       → backend.releaseSpec(name)
PUT   /api/specs/:name/handoff       → backend.writeHandoff(name, body.content)
POST  /api/regenerate                → backend.regenerateIndex()
GET   /api/validation                → backend.validateRepo()
GET   /api/docs                      → backend.listDocs()
GET   /api/docs/:path*               → backend.readDoc(path)
```

**Implementation notes:**
- Bind to `127.0.0.1` only — never `0.0.0.0`. Localhost-only is the security model.
- Inject `window.zettelgeistConfig = { theme: <from .zettelgeist.yaml> }` into the served HTML by string-replacing a placeholder in `index.html`.
- Serve `.zettelgeist/render-templates/viewer.css` (if exists) at `/static/user-overrides.css`. Inject a `<link>` for it after the bundled CSS.
- `--no-open` skips `xdg-open` / `open` / `start`.
- `--port N` overrides default 7681.
- Graceful shutdown on SIGINT.
- All POST/PUT endpoints accept JSON body; return `{commit: <sha>}` or `{acknowledged: true}` envelopes.

```ts
// packages/cli/src/server.ts (sketch)
import { createServer } from 'node:http';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadConfig, loadAllSpecs, deriveStatus, /* etc. */ } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';

export async function startServer(repoPath: string, port: number): Promise<{ stop: () => Promise<void> }> {
  const reader = makeDiskFsReader(repoPath);
  const cfg = await loadConfig(reader);
  // ... read index.html, inject config, prepare static asset map ...
  const server = createServer((req, res) => { /* route to handlers */ });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { stop: () => new Promise((res) => server.close(() => res())) };
}
```

**Tests:** start server against tmpdir repo, assert it serves index.html, assert `/api/specs` returns expected shape, assert `POST /api/specs/foo/tasks/1/tick` flips a checkbox and produces a commit. ~5 tests.

**Commit:** `feat(cli): serve command with local HTTP server hosting the viewer`

### Task 20: `export-doc` command

**Files:** `src/commands/export-doc.ts`, `src/render.ts` (markdown→HTML), `templates/export.html` (default), `tests/export-doc.test.ts`.

Reads a markdown file, applies the default or user-specified template (mustache placeholders only — no JS execution), writes self-contained HTML to `.zettelgeist/exports/<name>.html`.

Default template includes inlined CSS (bundled), marked.js + highlight.js + mermaid (CDN), placeholders: `{{content}}`, `{{title}}`, `{{frontmatter.<key>}}`, `{{generated_at}}`, `{{tool_version}}`. Strict validation: unknown placeholders error with the valid set listed.

`--template <path>` overrides default. Template is HTML with mustache placeholders.

5 tests: default template renders, custom template renders, frontmatter access, unknown placeholder errors, output file location.

**Commit:** `feat(cli): export-doc command with mustache templates`

---

## Phase 5 — `mcp-server/` (Tasks 21–25)

### Task 21: MCP scaffold + tool registration

Same as original Plan 2's Task 18 (verbatim). Sets up `@modelcontextprotocol/sdk` server with stdio transport, tool registration via `ToolDef<I,O>` interface, `zod-to-json-schema` for converting Zod schemas to JSON Schema for the `tools/list` response.

**Commit:** `chore(mcp-server): scaffold package with bin entry + tool registration`

### Task 22: All 13 format-tool implementations (batched)

Implement the 13 tools from the original design §6.2 in three files (~one per concern):

- `src/tools/read.ts` — `list_specs`, `read_spec`, `read_spec_file`, `validate_repo`
- `src/tools/write.ts` — `write_spec_file`, `write_handoff`, `tick_task`, `untick_task`, `set_status`
- `src/tools/state.ts` — `claim_spec`, `release_spec`, `regenerate_index`, `install_git_hook`

Tests: one file per concern with ~3 tests each. ~10 unit tests total. Reuse the `writeFileAndCommit` helper pattern from the original Plan 2's Task 20.

**Commit:** `feat(mcp-server): 13 format tools (read, write, state)`

### Task 23: Two new context tools — `prepare_synthesis_context` + `write_artifact`

**Files:** `src/tools/synthesis.ts`, `tests/tools/synthesis.test.ts`.

```ts
const prepareSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }),
    z.object({ kind: z.literal('spec'), name: z.string() }),
    z.object({ kind: z.literal('recent'), days: z.number().int().positive() }),
  ]),
});

export const prepareSynthesisContextTool: ToolDef<...> = {
  name: 'prepare_synthesis_context',
  description: 'Returns shaped context (markdown + state JSON + suggested HTML structure) the calling agent uses to write an HTML report. The MCP does not call any LLM.',
  inputSchema: prepareSchema,
  async handler(args, ctx) {
    // Walk specs/, collect markdown, build state, return as a bundle
    // For 'recent', use git log to filter by date
    // For 'spec', narrow to one spec + its depends_on neighbors
  },
};

const writeArtifactSchema = z.object({
  name: z.string(),
  html: z.string(),
  commit: z.boolean().optional(),
});

export const writeArtifactTool: ToolDef<...> = {
  name: 'write_artifact',
  description: 'Write an HTML artifact under .zettelgeist/exports/ (or commit it under docs/exports/ if {commit: true}).',
  // ...
};
```

3 tests covering scope=all, scope=spec, write_artifact roundtrip.

**Commit:** `feat(mcp-server): synthesis context tools for agent-driven HTML reports`

### Task 24: SKILL.md

Content from the original Plan 2 design §6.4. Update the Tools table to include the two new synthesis tools.

**Commit:** `docs(mcp-server): add SKILL.md agent manifest`

### Task 25: bin.ts wiring + e2e

`bin.ts` imports all 15 tools, makeServer, connects StdioServerTransport. E2E test spawns the bin and verifies `tools/list` returns 15 tools.

**Commit:** `feat(mcp-server): wire bin.ts + e2e stdio test`

---

## Phase 6 — CI + Husky + finish (Tasks 26–28)

### Task 26: GitHub Actions CI

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm conformance
      - run: pnpm --filter @zettelgeist/viewer build
      - run: pnpm --filter @zettelgeist/cli build
      - run: node packages/cli/dist/bin.js regen --check
      - name: Playwright e2e (viewer)
        run: |
          pnpm exec playwright install --with-deps chromium
          pnpm --filter @zettelgeist/cli test:e2e
```

**Commit:** `ci: add GitHub Actions workflow with Playwright viewer e2e`

### Task 27: Husky template + viewer Playwright e2e

Two micro-tasks combined since they're small:

`.husky/pre-commit` template (committed, not auto-installed):
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
pnpm dlx zettelgeist regen --check
```

Playwright e2e at `packages/cli/tests/e2e/viewer.pw.test.ts`:

1. Spawn `zettelgeist serve` against a tmpdir repo with 3 specs.
2. Open the browser to `http://localhost:7681`.
3. Assert board view loads with 3 cards.
4. Click a card → assert detail view opens.
5. Click a checkbox → assert task tickets and a commit is produced.
6. Drag a card to Blocked column → assert modal opens.

**Commit:** `feat: husky template + viewer Playwright e2e`

### Task 28: Final verification + dogfood

Run the full chain:

```
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm conformance
pnpm --filter @zettelgeist/viewer build
pnpm --filter @zettelgeist/cli build
node packages/cli/dist/bin.js regen --check
node packages/cli/dist/bin.js install-hook
```

Verify `.git/hooks/pre-commit` contains the marker block.

Make a small commit (`echo "" >> README.md && git commit`) to verify the hook fires.

If anything diverges, fix inline.

**Commit:** `chore: dogfood install-hook and final verification`

---

## Self-review checklist (after Task 28)

- [ ] `pnpm -r test` green: ~76 unit + ~12 fs-adapters + ~30 viewer + ~25 cli + ~13 mcp-server + 11 conformance = ~167 tests
- [ ] `pnpm conformance` green
- [ ] `pnpm -r typecheck` clean
- [ ] `node packages/cli/dist/bin.js --help` prints help with 5 commands
- [ ] `zettelgeist serve` opens browser, board view loads, mobile-responsive at viewport 375×667
- [ ] `zettelgeist export-doc docs/superpowers/specs/2026-05-09-zettelgeist-v0.1-plan-2-design.md` produces a self-contained HTML in `.zettelgeist/exports/`
- [ ] `.git/hooks/pre-commit` contains the marker block, runs on commit
- [ ] No secrets, .env, credentials committed

---

## What ships when this plan is done

- `packages/fs-adapters/` — shared FsReader (disk + memory)
- `packages/viewer/` — local web app bundle (HTML/CSS/JS, mobile-responsive, host-agnostic)
- `packages/cli/` — `zettelgeist` binary with 5 commands; HTTP server hosting the viewer
- `packages/mcp-server/` — `zettelgeist-mcp` with 15 tools; SKILL.md
- `.github/workflows/ci.yml` — full CI gate
- `.husky/pre-commit` — template
- Repo's own `.git/hooks/pre-commit` — installed via dogfood

What's missing for a full v0.1 (covered later):

- **Plan 3** (smaller now): VSCode extension that reuses the viewer bundle by injecting a postMessage backend transport
- **Plan 4** (newly motivated): Layer 3 viewer template override + JS plugin templates
- **Plan 5** (was Plan 4): Hosted view (S3 + Lambda or similar) reusing the viewer bundle

The thesis the user articulated: *"this tool is made for humans to reduce friction and make agentic coding great for everyone. Agents and nerds and advanced solo devs are already fine. Everyone else isn't."*

That's the audience. The viewer is what we ship for them.
