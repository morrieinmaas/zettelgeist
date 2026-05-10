# Zettelgeist v0.1 — Plan 2 Design (viewer-first rewrite)

- **Status:** Draft
- **Date:** 2026-05-09 (rewritten 2026-05-10)
- **Author:** Mo
- **Topic:** The non-coder click surface, MCP server, minimal CLI, hook + CI
- **Builds on:** Plan 1 (format core + spec doc + conformance fixtures, complete)
- **Supersedes:** the original 2026-05-09 design at the same path; previous git history retained for context

## 1. Summary

Plan 2 ships the surface artifacts that turn Plan 1's format core into a usable product for the audience the README's pitch is written for: **non-tech team members**. Solo devs and agents are already fine with markdown; everyone else isn't. The thesis from Anthropic's Claude Code team — *agents produce more documents than humans read; markdown drives lossy improvisation; HTML lets the agent draw the actual chart and humans actually click around* — applies to Zettelgeist's interaction layer, not its storage layer.

So Plan 2 ships:

1. **The viewer** — an HTML/CSS/JS bundle that renders the markdown content as a rich, mobile-responsive web app. Board view, spec detail, dependency graph, inline edits, drag-to-blocked. The non-coder click surface the README has been promising for two design iterations.
2. **A minimal CLI** — `regen`, `validate`, `install-hook`, `serve`, `export-doc`. That's it. Power users get tick/claim/etc. via MCP, not via shell verbs.
3. **An MCP server** with the full 13-tool surface for agents.
4. **Pre-commit hook + CI** so `INDEX.md` stays current and conformance is enforced on PR.
5. **A pluggable backend abstraction** so the same viewer bundle works against `zettelgeist serve` (REST), VSCode extension (postMessage), or future hosted views (WebSocket/HTTP).

Plan 2 also locks the customization architecture (layered, opt-in, lives in `.zettelgeist/render-templates/`) and the principle that **storage stays markdown, interaction is HTML**.

## 2. Goals (in scope for Plan 2)

- **`packages/fs-adapters/`** — shared `makeDiskFsReader` and `makeMemFsReader`. Replaces ad-hoc duplications.
- **`packages/viewer/`** — the local web app. Vanilla HTML+CSS+JS (no framework). Talks only to a `window.zettelgeistBackend` injected by the host. Self-contained bundle that ships in the CLI's npm package and is reusable by future hosts (VSCode extension, Tauri, etc.).
- **`packages/cli/`** — the `zettelgeist` Node CLI. Five commands: `regen [--check]`, `validate`, `install-hook [--force]`, `serve`, `export-doc <path> [--template <path>]`. Plus `--json` envelope on every command. Uses Node's built-in `parseArgs`.
- **`packages/mcp-server/`** — full 13-tool MCP surface as specified in the previous plan's §9. Plus two new tools: `prepare_synthesis_context(scope)` and `write_artifact(name, html)` for agent-driven HTML report generation without our process making LLM calls.
- **`SKILL.md`** at `packages/mcp-server/SKILL.md` — agent-readable manifest in the CLI-Anything pattern.
- **Pre-commit hook installer** with smart-merge markers (`# >>> zettelgeist >>>`).
- **Husky template** at `.husky/pre-commit` for users who already use husky.
- **CI workflow** at `.github/workflows/ci.yml`.
- **Customization**: Layers 0, 1, 2 of the four-layer model (bundled defaults, theme selection via `viewer_theme`, CSS overrides at `.zettelgeist/render-templates/{viewer,export}.css`). Layer 3 (full template override) ships for export only; viewer Layer 3 is deferred to v0.2.
- **Format spec update** committing `.zettelgeist/render-templates/`, `regen-cache.json`, `exports/` paths (already done in this iteration).

## 3. Non-goals (deferred)

- VSCode extension (Plan 4 — now smaller because it reuses the viewer bundle).
- HTTP/SSE MCP transports (stdio only).
- `zettelgeist repl` interactive mode.
- Agent loop orchestration / our own LLM API calls.
- Events / webhooks.
- Suggestion-branch contribution flow.
- Multi-repo specs.
- CLI commands `tick`, `untick`, `claim`, `release`, `new`, `status`, `report`, `explain`. **All available via MCP** to power-user agents. The viewer covers the GUI need. Adding them as CLI commands is duplicative scripting glue we can add in v0.2 if there's demand.
- Layer 3 viewer template override (full SPA replacement). Defer to v0.2.
- JS-based plugin templates (`.zettelgeist/render-templates/viewer-plugin.js`) — needs sandboxing. Defer.
- Authentication / multi-user. Viewer serves localhost only.
- Real-time collaboration / CRDT. v0.3+.
- Rust port. v0.2+ if demand. Conformance fixtures are the contract.

## 4. Architecture

The big shift from the previous design: **the viewer is one bundle, multiple hosts.** Same UI code, swappable backend transport.

```
   packages/viewer/  (HTML/CSS/JS bundle — written ONCE)
                |
                | abstract: window.zettelgeistBackend = { listSpecs, tickTask, ... }
                |
        +-------+--------+--------+
        |                |        |
   [REST/HTTP]    [postMessage]   [future: WebSocket / hosted]
        |                |
   [Node http]      [VSCode ext host]
        |                |
        v                v
   @zettelgeist/core (same library both sides)
```

**Plan 2 ships only the REST host (`zettelgeist serve`).** The viewer bundle is built such that VSCode (Plan 4) and future surfaces can adopt it by implementing a different backend transport.

### Workspace packages

- `@zettelgeist/core` — unchanged from Plan 1. Pure TS, no I/O.
- `@zettelgeist/fs-adapters` — shared FsReader implementations (disk + memory).
- `@zettelgeist/viewer` — pure UI bundle. No filesystem/git deps. Talks only to `window.zettelgeistBackend`.
- `@zettelgeist/cli` — `zettelgeist` Node binary. Bundles the viewer artifacts. Runs the local HTTP server when `serve` is invoked.
- `@zettelgeist/mcp-server` — `zettelgeist-mcp` stdio MCP server.

### Key invariants

- **Storage stays markdown.** Every UI mutation is a markdown file edit + git commit.
- **Single source of truth for derivation logic.** Both `serve`'s REST endpoints and the MCP tools call the same `core` functions.
- **Stateless surfaces.** The MCP server and `serve`'s HTTP server are stateless across requests; they read fresh from disk on every call. `.claim` files are the only ephemeral state, and they live on disk (gitignored).
- **The viewer bundle is host-agnostic.** It assumes only that `window.zettelgeistBackend` is injected and implements the documented interface.
- **Mobile responsive.** Viewer CSS uses fluid layouts, semantic HTML, sane defaults via Pico.css (or equivalent classless framework).

## 5. Repo layout

```
zettelgeist/
├── packages/
│   ├── core/                     # unchanged
│   ├── fs-adapters/              # NEW: makeDiskFsReader, makeMemFsReader
│   ├── viewer/                   # NEW: pure HTML/CSS/JS bundle
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── src/
│   │   │   ├── index.html        # entry HTML page
│   │   │   ├── main.ts           # bootstrap; reads window.zettelgeistBackend
│   │   │   ├── views/            # board.ts, detail.ts, graph.ts
│   │   │   ├── components/       # cards, modals, edit forms
│   │   │   ├── styles/           # base.css, light.css, dark.css
│   │   │   └── backend.ts        # backend interface + types (no impl)
│   │   └── tests/
│   │       └── *.test.ts         # DOM + integration tests via jsdom + happy-dom
│   ├── cli/                      # NEW
│   │   ├── package.json          # "bin": { "zettelgeist": "./dist/bin.js" }
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── src/
│   │   │   ├── bin.ts
│   │   │   ├── router.ts
│   │   │   ├── output.ts
│   │   │   ├── git.ts
│   │   │   ├── server.ts         # the localhost HTTP server for `serve`
│   │   │   ├── render.ts         # markdown→HTML for export-doc
│   │   │   └── commands/
│   │   │       ├── regen.ts
│   │   │       ├── validate.ts
│   │   │       ├── install-hook.ts
│   │   │       ├── serve.ts
│   │   │       └── export-doc.ts
│   │   ├── viewer-bundle/        # populated at build time from ../viewer/dist/
│   │   ├── templates/            # default export.html, default CSS
│   │   └── tests/
│   └── mcp-server/               # NEW
│       ├── SKILL.md
│       ├── src/
│       │   ├── bin.ts
│       │   ├── server.ts
│       │   └── tools/            # 15 tools (13 from Plan 1 design + 2 new context tools)
│       └── tests/
├── spec/conformance/harness/     # consumes @zettelgeist/fs-adapters
├── spec/zettelgeist-v0.1.md      # updated with §11 reserved paths
├── .github/workflows/ci.yml      # NEW
├── .husky/pre-commit             # NEW (template, not auto-installed)
├── .zettelgeist/                 # NEW dot-folder, see §11 of format spec
│   ├── render-templates/         # user-managed, committed
│   │   ├── viewer.css            # optional CSS override (Layer 2)
│   │   └── export.css            # optional CSS override for export-doc
│   ├── regen-cache.json          # tool-managed, gitignored
│   └── exports/                  # tool-managed, gitignored
└── (unchanged)
```

## 6. Components

### 6.1 `packages/fs-adapters/`

Smallest of the three new packages. Lands first.

```ts
export function makeDiskFsReader(rootDir: string): FsReader { /* ... */ }
export function makeMemFsReader(files: Record<string, string>): FsReader { /* ... */ }
```

Replaces duplicated test helpers in `packages/core/tests/{loader,validate}.test.ts` and `spec/conformance/harness/src/run.ts`.

### 6.2 `packages/viewer/` — the centerpiece

A vanilla HTML/CSS/JS web app. **Zero filesystem/git deps in source.** Bootstraps off a global `window.zettelgeistBackend` that the host injects.

**The backend interface** (the contract every host implements):

```ts
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
  // For doc rendering (read-only, viewer-only):
  listDocs(): Promise<DocEntry[]>;          // markdown files under docs/
  readDoc(path: string): Promise<{ rendered: string; metadata: DocMetadata }>;
}
```

**Views shipped in v0.1:**

1. **Board view** — Kanban columns: Draft / Planned / In Progress / In Review / Done / Blocked / Cancelled. Cards show name, progress, blocked-by. Mobile: stacks vertically with column headers as accordion sections.
2. **Spec detail view** — clicked from a card. Tabs for: Requirements, Tasks, Handoff, Lenses (if any). Mermaid graph subset showing this spec + its `depends_on` neighbors. Inline edit forms for frontmatter (status override, blocked_by, depends_on). Click-to-tick on tasks.
3. **Graph view** — full repo dependency graph rendered via Mermaid. Node click → spec detail.
4. **Docs view** — read-only rendered markdown of any file under `docs/` and the format spec. Useful for sharing design narratives via the same surface.

**Drag and drop:**

- Cards in `Draft / Planned / In Progress / In Review / Done` are read-only by drag — these statuses are derived; you change them by ticking tasks.
- Cards can be dragged INTO `Blocked` or `Cancelled` columns — opens a modal asking for reason; on confirm, writes frontmatter and commits.
- Cards can be dragged OUT of `Blocked` / `Cancelled` back to "auto" — clears the override; status snaps back to derived.

**Mermaid handling:**

- Lazy-loaded from CDN on the Graph tab (no upfront cost on board view).
- Renders the same edge data the format spec describes (`depends_on` only; `part_of` clusters via subgraph).

**Markdown rendering:**

- `marked.js` (small, well-known, MIT). Bundled into the viewer.
- Code blocks get syntax highlighting via `highlight.js` (also bundled, common languages only).

### 6.3 `packages/cli/` — minimal

Five commands. Uses Node `util.parseArgs` plus a small router. Bundles the viewer artifacts at build time.

```
zettelgeist regen [path] [--check] [--json]       # regenerate INDEX.md (--check exits 1 on stale)
zettelgeist validate [path] [--json]              # run validateRepo
zettelgeist install-hook [--force] [--json]       # install pre-commit hook
zettelgeist serve [path] [--port N] [--no-open]   # launch local HTTP server + open browser
zettelgeist export-doc <path> [--template P] [--json]  # markdown → standalone HTML at .zettelgeist/exports/
```

**`zettelgeist serve` details:**
- Default port 7681 (uncommon, avoids common conflicts). User-configurable via `--port`.
- Default behavior: open `$BROWSER` (or `xdg-open` / `open` / `start` per platform) to `http://localhost:<port>/`.
- HTTP server serves:
  - `/` → viewer's `index.html`
  - `/static/*` → viewer assets (CSS, JS, fonts)
  - `/api/*` → JSON REST endpoints implementing the `ZettelgeistBackend` interface
  - `/docs/*` → rendered markdown from `docs/`
- Graceful shutdown on SIGINT.
- Stays in foreground; logs requests at `--verbose`.

**`zettelgeist export-doc` details:**
- Reads a markdown file (anywhere in the repo).
- Renders to a single self-contained HTML file at `.zettelgeist/exports/<filename>.html`.
- Default template uses bundled CSS, plus marked.js + highlight.js + mermaid (inlined).
- `--template <path>` overrides with a user-provided HTML file with mustache placeholders.
- Templates are static text substitution — no JS execution, no sandboxing concern.
- Available placeholders: `{{content}}`, `{{title}}`, `{{frontmatter.<key>}}`, `{{generated_at}}`, `{{tool_version}}`.
- Strict placeholder validation: typos in `{{xxx}}` produce a clear error listing valid keys.

### 6.4 `packages/mcp-server/`

Same 13 tools from the original Plan 2 design §9, plus:

- **`prepare_synthesis_context(scope)`** → returns shaped context (markdown bundle + JSON state + suggested HTML structure stub) the calling agent can use to write a report. The MCP doesn't make LLM calls; the agent does.
- **`write_artifact(name, html)`** → writes a generated HTML artifact under `.zettelgeist/exports/<name>.html` (or commits it under a non-gitignored path if specified, with a flag). Provides the storage half of the agent-driven report flow.

Agents call these in pairs to produce HTML reports/explainers without our process owning any LLM orchestration.

### 6.5 `SKILL.md`

Same as the original Plan 2 design §6.4. YAML frontmatter (`name: zettelgeist`, `description: ...`) + Purpose / Requirements / Agent Guidance / Tools / Examples sections. Bundled in the npm package.

### 6.6 GitHub Actions CI

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
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm conformance
      - run: pnpm --filter @zettelgeist/cli build
      - run: node packages/cli/dist/bin.js regen --check
```

### 6.7 Husky template

`.husky/pre-commit`:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
pnpm dlx zettelgeist regen --check
```

Committed as a template. Not auto-installed.

## 7. Data flow

| Trigger | Path |
|---|---|
| User runs `zettelgeist serve` | CLI starts Node http server, opens browser → viewer loads → calls `/api/specs` → server reads disk via `core` → returns JSON. |
| User clicks a checkbox in the viewer | viewer calls `backend.tickTask(name, n)` → `POST /api/specs/<name>/tasks/<n>` → server flips checkbox in `tasks.md`, regen, commit, returns commit SHA. Viewer re-fetches and re-renders. |
| User edits frontmatter via webview form | viewer calls `backend.writeSpecFile(name, 'requirements.md', content)` → POST → server writes, regen, commit. |
| User drags a card to "Blocked" | viewer opens reason modal → on confirm calls `backend.setStatus(name, 'blocked', reason)` → POST → server mutates frontmatter, commits. |
| User runs `zettelgeist regen` from terminal | reads disk via `core`, computes INDEX.md, writes if changed (uses regen cache via git tree SHA — see §9). |
| User runs `git commit` | pre-commit hook executes `zettelgeist regen --check`. Exit 1 → commit blocks with "INDEX.md is stale, run `zettelgeist regen`". |
| Agent calls MCP `tick_task` | same path as the viewer's tick — both go through `core` and produce a `[zg] tick: <spec>#<n>` commit. |
| Agent calls `prepare_synthesis_context` then synthesizes HTML and calls `write_artifact` | MCP returns shaped data, agent uses its own context window to render HTML, MCP receives the HTML and writes it under `.zettelgeist/exports/`. No LLM call from our process. |
| User runs `zettelgeist export-doc docs/foo.md` | reads markdown, applies template (default or `--template`), writes `.zettelgeist/exports/foo.html`. Self-contained, shareable via S3. |
| CI runs on PR | typecheck → test → conformance → CLI build → `regen --check`. Any non-zero exit fails. |

**Two invariants:**

1. **The pre-commit hook never writes.** It only checks. Users debug by re-running `regen` and re-staging.
2. **Every UI/MCP mutation produces exactly one commit.** No silent batching.

## 8. Customization (the four-layer model)

| Layer | Where | What | v0.1? |
|---|---|---|---|
| **0. Defaults** | `packages/cli/dist/viewer-bundle/`, `packages/cli/dist/templates/` | Bundled HTML/CSS/JS for viewer; default `export.html` template | **Yes** |
| **1. Theme** | `viewer_theme: light \| dark \| system` in `.zettelgeist.yaml` | Selects between two bundled themes; system follows OS preference | **Yes** |
| **2. CSS override** | `.zettelgeist/render-templates/{viewer,export}.css` | Appended after bundled CSS — overrides via cascade | **Yes** |
| **3. Full template override** | `.zettelgeist/render-templates/{viewer/, export.html}` | Replaces bundled defaults entirely | **Export only** in v0.1 (mustache HTML file). Viewer Layer 3 deferred — full SPA replacement is a v0.2+ ask. |

**Strict placeholder validation** for export templates: unknown `{{xxx}}` tokens produce a build-time error listing the valid set (`content`, `title`, `frontmatter.*`, `generated_at`, `tool_version`).

**Theme bundle** ships:

- `light.css` — neutral defaults, white background, dark text
- `dark.css` — dark background, soft white text
- `system` (default) — `prefers-color-scheme` media query selects between them

**No JS plugins in v0.1.** A user-supplied `.js` file running inside our tool is a sandboxing concern; defer to v0.2+.

## 9. The regen cache (using git as a Merkle tree)

`zettelgeist regen` and `zettelgeist regen --check` both consult a content-addressed cache before walking specs:

- Cache lives at `.zettelgeist/regen-cache.json` (gitignored).
- Keyed by the git tree SHA of `<specs_dir>/`, obtained via `git rev-parse HEAD:<specs_dir>`.
- Cache hit → return cached generated INDEX.md content. No walk.
- Cache miss → walk via `core.runConformance`, write cache.
- Non-git directories or pre-first-commit state: cache layer is a no-op; regen always walks.

This uses git's existing Merkle structure rather than building one of our own. ~30 LOC of integration. Useful at any scale, mandatory at thousand-spec scale.

## 10. CLI command surface (final)

```
zettelgeist regen [path] [--check] [--json]
zettelgeist validate [path] [--json]
zettelgeist install-hook [--force] [--json]
zettelgeist serve [path] [--port N] [--no-open] [--json]
zettelgeist export-doc <path> [--template P] [--json]
```

That's all. Five commands. Power-user operations (tick, claim, status, etc.) are MCP-driven. The viewer is the GUI.

**JSON envelope** per command, when `--json` passed:

```ts
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; detail?: unknown } };
```

No CLI-surface error codes; format-layer error codes (`E_CYCLE`, `E_INVALID_FRONTMATTER`, `E_EMPTY_SPEC`) appear inside `error.detail.errors[]` as appropriate.

## 11. MCP tool surface

The 13 tools from the original Plan 2 design §9 (`list_specs`, `read_spec`, `read_spec_file`, `write_spec_file`, `tick_task`, `untick_task`, `set_status`, `claim_spec`, `release_spec`, `write_handoff`, `regenerate_index`, `validate_repo`, `install_git_hook`).

Plus two new tools for agent-driven HTML synthesis:

```ts
// prepare_synthesis_context
input:  z.object({
  scope: z.union([
    z.object({ kind: z.literal('all') }),
    z.object({ kind: z.literal('spec'), name: z.string() }),
    z.object({ kind: z.literal('recent'), days: z.number().int().positive() }),
  ]),
})
output: z.object({
  markdown_bundle: z.string(),     // concatenated markdown of all relevant specs + handoffs
  derived_state: z.unknown(),      // JSON of statuses, graph, recent commits
  template_hint: z.string(),       // suggested HTML structure (mustache-friendly)
  available_artifacts: z.array(z.string()),  // existing exports/ files for cross-reference
})

// write_artifact
input:  z.object({
  name: z.string(),               // e.g. "weekly-report-2026-05-09"
  html: z.string(),               // full HTML content
  commit: z.boolean().optional(), // default false: gitignored under exports/.
                                  // true: commits to a non-gitignored docs/exports/ — for archival
})
output: z.object({ path: z.string(), committed: z.boolean(), commit_sha: z.string().nullable() })
```

The agent calls these in pairs: `prepare_synthesis_context` to get data, synthesize HTML in its own context window, then `write_artifact` to store. The MCP server makes no LLM calls.

## 12. Testing strategy

- **`fs-adapters/`** — ~12 unit tests (mem + disk against tmpdir).
- **`viewer/`** — DOM tests via jsdom for components, integration tests for full board view rendering. Mocked `window.zettelgeistBackend`.
- **`cli/`** — unit tests for `output`, `router`, `git`, `render`. E2E test that spawns the bin and exercises `regen → validate → serve → export-doc` against a tmpdir repo.
- **`mcp-server/`** — in-process unit tests per tool via `Server.connect(InMemoryTransport)`. One stdio e2e.
- **Workspace-level**: `pnpm -r test`, `pnpm conformance`, `pnpm -r typecheck`, plus a Playwright e2e that spawns `zettelgeist serve` and drives the viewer end-to-end (board view loads, click a card, edit a checkbox, verify commit).

Total new tests: ~70-80 across all packages.

## 13. Open questions

- **MCP SDK version.** Pin a specific version; track for breaking changes.
- **Viewer base CSS framework.** Recommendation: Pico.css (~10KB classless, mobile-friendly defaults) + custom layer for Zettelgeist-specific components. Alternative: hand-rolled CSS, smaller but more work. **Decision before viewer build: Pico.css.**
- **Markdown renderer choice.** marked.js — well-known, MIT, ~30KB. Confirmed.
- **Graph rendering library.** Mermaid — already used by INDEX.md. CDN-loaded for the Graph tab to avoid upfront bundle cost. Confirmed.
- **Auth on `serve`.** v0.1: localhost only, no auth. The Node server binds 127.0.0.1, refuses external connections. Same approach as `vite dev`, `next dev`, etc.
- **Concurrent backend writes.** Two viewers, two clicks at once → both go through git which serializes. Last-write-wins on `tasks.md` race; the rare conflict surfaces as a 409 from the server which the viewer handles by re-fetching. Better than v0.1 needs.
- **Hook installation on Windows.** `chmod 0755` is a no-op on Windows; Git for Windows handles the executable bit. Test on macOS/Linux only.

## 14. What this design does NOT commit to

- That the viewer's UI is final. v0.1 ships a usable surface; v0.2+ refines based on real usage.
- That the MCP tool surface is final. Adding tools is non-breaking; renaming or removing requires a major-version bump.
- That HTML is always tool-bundled. The principle holds for v0.1 (and beyond, by default), but a future version may revisit if there's strong demand for a "viewer in the repo" pattern. High bar — would compromise "clone the repo and you have it."
- That the viewer must be vanilla JS forever. v0.2+ may pick up a small framework (Solid, Lit, Preact) if the hand-rolled approach becomes painful. The `window.zettelgeistBackend` interface stays stable across that transition.
- That `serve` always serves localhost. v0.2+ may add a `--host 0.0.0.0` flag for LAN access (with auth, see open questions).
- That CI runs only on GitHub Actions. The same `regen --check` invocation works on any forge; we just ship one config in v0.1.

## 15. Why this scope

The previous (28+1-task) Plan 2 design was correct but too cautious. It over-invested in CLI commands the user can already do via MCP, and stubbed the viewer to a placeholder. That deferred the centerpiece — the non-coder click surface that the README's whole pitch is built on — to a hypothetical "Plan 2.5."

This rewrite reverses the priorities. The viewer ships first-class. The CLI shrinks to operational glue. MCP stays full because agents need it. Pre-commit hook + CI are still the dev hygiene layer.

The thesis from Anthropic's Claude Code team is the lever: humans don't read walls of markdown; they click around HTML. Specs + storage stay markdown because that's the right format for edit-over-time, agent-mutable, git-diffable, prose-heavy content. But the moment a human opens Zettelgeist to look at the project, they see HTML.

The viewer makes good on the README's promise: "a clickable surface non-coders can contribute to without ever leaving the repo."
