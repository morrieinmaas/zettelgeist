# Zettelgeist v0.1 — Design

- **Status:** Draft
- **Date:** 2026-05-06
- **Author:** Mo
- **Topic:** Format spec + VSCode extension + MCP server

## 1. Summary

Zettelgeist is a portable file format for spec-driven, agent-friendly project management. The repo *is* the project board: status is derived from markdown files on every read, never stored independently.

v0.1 ships three artifacts:

1. **A formal RFC-style spec** (`spec/zettelgeist-v0.1.md`) — the contract any tool implements against.
2. **A VSCode extension** (`.vsix`) — the human surface: tree view, Kanban webview, spec detail webview, inline checkbox ticking.
3. **An MCP server** (`zettelgeist-mcp`, npm package) — the agent surface: stdio tools any agent host (Claude Code, Cursor, Codex) can call.

The two implementations share a TS core in the same monorepo. Conformance fixtures define what conformant means; the spec doc is language-neutral so future implementations in other languages validate against the same fixtures, not against our code.

## 2. Goals (in scope for v0.1)

- File conventions: `specs/<name>/{requirements.md, tasks.md, handoff.md}` plus optional `lenses/*.md`.
- Frontmatter fields on `requirements.md`: `status`, `blocked_by`, `depends_on`, `part_of`, `replaces`, `merged_into`, `auto_merge` (parsed; not yet acted on).
- Inline task tags: `#human-only`, `#agent-only`, `#skip`.
- Derived status across 7 states (5 derived + 2 frontmatter overrides).
- Spec graph from frontmatter, with `depends_on` cycle detection.
- `specs/INDEX.md` deterministic regeneration: byte-identical across conformant tools.
- Repo opt-in via `.zettelgeist.yaml` at repo root, declaring `format_version`.
- VSCode extension: tree view, Kanban webview, spec detail webview, inline gutter checkbox decorations, commands.
- MCP server: primitives only, stdio transport.
- Conformance fixtures with a Node test harness; same fixture format reusable by future implementations.
- Format versioning via semver in `.zettelgeist.yaml`. Mismatch produces a warning, not a crash.

## 3. Non-goals (deferred to v0.2+)

- Events (webhooks / MCP event stream).
- Suggestion-branch contribution flow for non-coders. v0.1 edits commit to the current branch like any other markdown edit.
- Agent loop orchestration. The user manually tells their already-running agent which spec to work on; the MCP exposes only primitives.
- `auto_merge: true` triggering anything (parsed but inert).
- Multi-repo specs.
- Other surfaces (web app, terminal TUI, mobile, JetBrains, Zed).
- A practices doc (`zettelgeist-practices.md`) — workflow opinions live elsewhere.
- A reference library in any other language. Conformance fixtures, not a published library, are the contract for other implementations.

## 4. Architecture

Two peer artifacts, sharing a TS core at build time, never coordinating at runtime.

```
+---------------------+         +---------------------+
|  VSCode extension   |         |  zettelgeist-mcp    |
|  (.vsix)            |         |  (stdio MCP server) |
+----------+----------+         +----------+----------+
           |                               |
           |       imports at build        |
           +-------------+ +---------------+
                         | |
                    +----v-v----+
                    |   core    |  pure TS, no I/O
                    +-----+-----+
                          |
                          v
                  filesystem (specs/)
```

- The extension is spawned by VSCode. The MCP server is spawned by whatever agent host the user has configured (Claude Code, Cursor, etc.). They never communicate directly. They coordinate through the file system.
- Both import `core` directly. Neither rounds-trips through MCP for its own queries.
- `core` has no I/O dependencies — it operates over a passed-in filesystem reader. This makes it trivially testable against in-memory fixture repos.

## 5. Repo layout

```
zettelgeist/
├── spec/
│   ├── zettelgeist-v0.1.md          # the formal RFC-style spec (the contract)
│   ├── conformance/
│   │   ├── fixtures/                 # input/ + expected/ pairs
│   │   └── harness/                  # Node test runner
│   └── examples/                     # well-formed sample specs to copy
├── packages/
│   ├── core/                         # internal: parser, status, graph, regen
│   ├── mcp-server/                   # ships as npm bin: zettelgeist-mcp
│   └── extension/                    # ships as .vsix
├── pnpm-workspace.yaml
├── package.json
├── README.md                         # the design narrative (existing)
└── .zettelgeist.yaml                 # we dogfood our own format
```

## 6. Components

### 6.1 `core/`

Pure TS. No `fs`, no `child_process`, no `vscode`. All I/O is injected.

Public surface:

```ts
loadSpec(fs, specName): Spec
loadAllSpecs(fs): Spec[]
parseFrontmatter(text): { data, body }
parseTasks(body): Task[]                       // [{ checked, text, tags }]
deriveStatus(spec, repoState): Status
buildGraph(specs): { nodes, edges, blocks, cycles }
validateRepo(specs): { errors: ValidationError[] }
regenerateIndex(specs, existingIndex): string  // returns content; caller writes
```

Key shapes:

```ts
type Status =
  | 'draft' | 'planned' | 'in-progress' | 'in-review' | 'done'
  | 'blocked' | 'cancelled';

type ValidationError =
  | { code: 'E_CYCLE',               path: string[] }
  | { code: 'E_INVALID_FRONTMATTER', path: string,   detail: string }
  | { code: 'E_EMPTY_SPEC',          path: string };
```

`repoState` is passed in (not fetched). It carries git facts the impl needs for status derivation: presence of `.claim` files, whether the spec's tasks-touching commits are merged to the default branch, etc. Caller gathers them and hands them in. Core never shells out to git.

### 6.2 `mcp-server/`

Stdio MCP server. Imports `core` directly. Tool surface — primitives only, no orchestration:

| Tool | Effect |
|---|---|
| `list_specs` | summaries with status, progress, blockers |
| `read_spec(name)` | returns all files of a spec |
| `read_spec_file(name, relpath)` | one file |
| `write_spec_file(name, relpath, content)` | atomic write → regen INDEX → commit |
| `tick_task(name, n)` | flip checkbox at position n → commit |
| `untick_task(name, n)` | unflip → commit |
| `set_status(name, status, reason?)` | mutate frontmatter (used for blocked/cancelled) → commit |
| `claim_spec(name, agent_id)` | write ephemeral `.claim` (gitignored, not committed) |
| `release_spec(name)` | remove `.claim` |
| `write_handoff(name, content)` | write `handoff.md` → commit |
| `regenerate_index` | run regen → write → commit if changed |
| `validate_repo` | returns validation errors with machine codes |
| `install_git_hook` | install pre-commit hook (with consent flag) |

Conventions:

- Every write tool that mutates a tracked file produces one commit. No batching.
- Commit message format: `[zg] <op>: <spec>` (e.g., `[zg] tick: user-auth#3`).
- Errors return MCP error responses with the same machine codes the spec doc enumerates. Human-readable messages are implementation freedom.

### 6.3 `extension/` (VSCode)

Components:

- **Spec Tree View** in the sidebar, specs grouped by derived status, badges showing progress (`3/5`).
- **Kanban Webview** — full pane, columns for the 7 states. One card per spec.
- **Spec Detail Webview** — opened on card click. Renders `requirements.md`, `tasks.md`, `handoff.md`, lens tabs side-by-side. Frontmatter rendered as plain HTML form fields (`<input>`, `<select>`, `<textarea>`). Body content rendered as preview with an "Edit body" button.
- **No editor in the webview.** Clicking "Edit body" opens the underlying `.md` in a regular VSCode tab. Users get full Monaco for free; we don't bundle a duplicate.
- **Inline gutter decorations** on `tasks.md` editor tabs. Click the gutter to flip the checkbox. Uses `TextEditorDecorationType`.
- **Commands** (palette + context menu): `Zettelgeist: Regenerate Index`, `Zettelgeist: Install Git Hook`, `Zettelgeist: New Spec`, `Zettelgeist: Validate Repo`, `Zettelgeist: Configure Agent Access`.
- **File watcher** under `specs/` and `.zettelgeist.yaml`. On any change → re-derive in memory → tree/Kanban refresh. No INDEX.md round-trip.
- **`Configure Agent Access` setup helper** — detects installed agent hosts (Claude Code, Cursor) and helps the user wire `zettelgeist-mcp` into their MCP client config. One-time setup, not a runtime daemon.

UI rules:

- **One commit per UI action.** Tick box = one commit. Frontmatter form save = one commit. No silent batching.
- **Plain VSCode saves don't auto-commit.** Saving a markdown file in a normal editor tab is just a save. Commit happens via VSCode's git panel or terminal. The pre-commit hook regens INDEX.md at that point.
- **Drag-and-drop into `Blocked` or `Cancelled` columns** opens a modal asking for a reason, then writes frontmatter and commits. Drag *out* of those columns removes the override (status snaps back to derived). All other column targets reject the drag with a tooltip: "Status is derived from `tasks.md`. Tick or untick tasks to change it."
- **Conflict handling (v0.1):** if the on-disk mtime changed since load when the extension goes to write, show a warning modal and offer reload-and-redo. Real conflict UI is v0.2.

## 7. Format rules (the spec doc carries the normative version)

This section is the design-time summary. The full normative spec lives at `spec/zettelgeist-v0.1.md` and is what implementations consume.

- A **spec** is a folder under `specs/` containing at least one `.md` file. Folder name matches `[a-z0-9-]+`.
- **Frontmatter** lives only in `requirements.md`. If `requirements.md` is absent, the spec has no frontmatter — that's a valid stub state. Tools may prompt to draft one; the format does not.
- **Status derivation** evaluates in priority order:
  1. `cancelled` if frontmatter says so.
  2. `blocked` if frontmatter says so.
  3. `in-progress` if a `.claim` file is present, or some checkboxes are ticked but not all.
  4. `in-review` if all non-`#skip` checkboxes are ticked and the change is not yet merged to the default branch.
  5. `done` if all non-`#skip` checkboxes are ticked and the change is merged.
  6. `planned` if checkboxes exist with none ticked.
  7. `draft` otherwise (no `tasks.md`, or `tasks.md` has no checkboxes).
- **Inline tags** in `tasks.md` lines: `#human-only` (agent skips, board flags), `#agent-only` (UI cannot tick; agent must commit the check), `#skip` (excluded from progress counting). Whitespace-delimited, case-sensitive, anywhere on the task line.
- **Spec graph:** `depends_on` is the only outgoing dependency edge. `part_of` is grouping. `replaces` and `merged_into` are lifecycle pointers. Reverse edges (`blocks`) are derived at index time.
- **`specs/INDEX.md`** has a single delimiter:

  ```
  <!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->
  ```

  Region above is human-edited and preserved byte-identical on regen. Region below is fully replaced. If the marker is absent, regen inserts it at the top of the file (existing INDEX.md content becomes the human region).
- **Validation errors** (full set):
  - `E_CYCLE` — `depends_on` cycle detected.
  - `E_INVALID_FRONTMATTER` — YAML parse failure or wrong type in a known field.
  - `E_EMPTY_SPEC` — folder exists under `specs/` but contains no `.md` file.
  Everything else (nested `lenses/`, weird folder names, unknown `format_version`) is silently tolerated or surfaces as a tool-level warning. The format is permissive; tools choose strictness.
- **`format_version`** in `.zettelgeist.yaml` is required at repo level (single value, semver). Spec files don't redeclare it.

## 8. Data flow

| Trigger | Path |
|---|---|
| User opens a Zettelgeist repo in VSCode | Extension detects `.zettelgeist.yaml` → walks `specs/` → builds in-memory state via `core` → populates tree view + Kanban. |
| User clicks an inline gutter checkbox on `tasks.md` | Extension flips checkbox → atomic write → regen → stage `tasks.md` + `INDEX.md` → commit `[zg] tick: <spec>#<n>`. |
| User edits frontmatter in webview form + saves | Webview posts message → extension serializes frontmatter → atomic write → regen → stage → commit `[zg] edit: <spec>/requirements.md`. |
| User opens body in VSCode tab and saves | Standard VSCode save → file watcher fires → extension re-derives → tree/Kanban refresh. **No auto-commit.** Commit is via the user's normal git flow; pre-commit hook regens INDEX.md then. |
| External agent calls `tick_task` via MCP | MCP server reads → flip → atomic write → regen → stage → commit. File watcher in extension fires → UI updates. |
| User runs `git pull` and gets new specs | File watcher fires → extension re-derives. INDEX.md is already current (committed upstream). |
| User commits via plain `git commit` in terminal | Pre-commit hook runs `zettelgeist regen` → stages updated INDEX.md → commit includes it. |
| Cycle introduced via `depends_on` | `validateRepo` returns `E_CYCLE`. Regen refuses to write — leaves prior INDEX.md untouched. Extension shows notification. MCP returns the error code. CI fails. |
| Two writers race | Both atomic-write so file is never corrupt. Extension's mtime check warns the user when the on-disk mtime has changed since load. v0.2 owns real conflict UI. |

Invariant: **every state-changing operation is a file mutation.** Restart anything; state is unchanged because state was always the files. Claims are the one ephemeral exception (gitignored, written by claiming process, removed on release).

## 9. INDEX.md regeneration

- **Live UI does not depend on INDEX.md.** The extension and MCP server derive state directly from the file tree on each refresh. INDEX.md is the artifact for people without the tool installed (GitHub web view, plain `cat`, etc.).
- **Regen happens at commit time**, from any path that produces a commit. Three triggers, one shared function:
  1. Extension's webview/checkbox commit handlers.
  2. MCP server's commit-producing tools.
  3. Git pre-commit hook (for users editing files raw and committing via plain git).
- **Atomic write:** write `INDEX.md.tmp`, rename to `INDEX.md`. Readers never see partial content. Output is byte-identical regardless of writer, so write order doesn't matter.
- **CI is the real safety net.** `zettelgeist regen --check` runs in CI and fails if INDEX.md is stale. Pre-commit hook is convenience; CI is the contract. Hooks are bypassable; CI is not.
- **Hook installation requires consent.** Extension prompts on first activation in a Zettelgeist repo. MCP server exposes `install_git_hook` as an explicit tool call. We never silently mutate `.git/hooks/`.

## 10. Conformance

The fixture format is the contract. Other-language implementations validate against the same fixtures.

```
spec/conformance/fixtures/
├── 01-empty-repo/
│   ├── input/                       # repo snapshot to feed the impl
│   │   └── .zettelgeist.yaml
│   └── expected/
│       ├── statuses.json            # { "specs": {} }
│       ├── graph.json               # { "nodes": [], "edges": [], "cycles": [] }
│       ├── validation.json          # { "errors": [] }
│       └── INDEX.md                 # byte-exact expected file
├── 02-single-spec-no-tasks/
├── 03-tasks-with-skip-and-human-only/
├── 04-cycle-must-error/
├── 05-part-of-clusters/
├── 06-blocked-by-frontmatter-override/
├── 07-merged-into-redirect/
├── 08-human-region-preserved-byte-identical/
└── ...
```

Comparison rules (in the spec doc):

- **JSON files** compared by deep structural equality after parse. Key order and whitespace don't matter.
- **`INDEX.md`** compared byte-exact.
- **Validation errors** matched on `{code, path}` only — never on human messages.

Each numbered rule in the spec doc cites the fixture(s) that prove it (a rule→fixture appendix). New rule = new fixture. Missing fixture = the rule is unenforceable and either gets one or gets removed.

The Node harness at `spec/conformance/harness/` runs our own implementation against every fixture. Any other implementation reimplements the harness in its language using the same fixture format; ~weekend-scale work, by design.

## 11. Testing strategy

- **`core`** — unit tests driven directly by the conformance fixtures. The same fixtures are both the contract and our test corpus.
- **`mcp-server`** — integration tests that spawn it, send tool calls over stdio, and assert on file outputs (using temp directories with copied fixture inputs).
- **`extension`** — `@vscode/test-electron` smoke tests covering tree view population, command invocations, and webview message handling. Webview internals tested separately via DOM assertions.
- **CI** runs all of the above plus `zettelgeist regen --check` against the repo's own dogfooded `specs/` (once any exist).

## 12. Open questions / risks

- **Hook installation friction.** Some users will object to any extension touching git internals. The opt-in flow needs to be unobtrusive but real, and the spec needs to be implementable without a hook (CI is the safety net).
- **Webview UX maturity.** Plain HTML form fields for frontmatter are functional but won't feel premium. v0.1 ships honest minimum; iteration target is v0.2.
- **Default branch detection for `done` status.** Repos vary (`main`, `master`, custom). v0.1 reads `.zettelgeist.yaml`'s optional `default_branch` if set, else falls back to `git symbolic-ref refs/remotes/origin/HEAD` → repo HEAD. Edge cases (detached HEAD, non-git repos) need to be enumerated in the spec doc.
- **Claim file lifecycle when an agent crashes.** A `.claim` file outlives a dead process. v0.1 punts: claims age out after a configurable timeout (default 24h) — stale claims are ignored by status derivation. Real liveness is v0.2+.
- **Spec name collisions across forks/PRs.** Two PRs introducing `specs/user-auth/` independently will conflict at merge. Standard git conflict; format adds nothing. Worth noting in the spec doc as a known property, not a defect.

## 13. Implementation sequencing (sketch)

The detailed plan lands in a separate writing-plans document. High-level order:

1. **`core` + conformance fixtures.** No surface yet. Fixtures + Node harness pass against `core`. This is the foundation; nothing else can ship correctly without it.
2. **The formal spec doc.** Written in parallel with `core`, kept in sync via the rule→fixture map.
3. **MCP server.** Thin wrapper around `core`. Validates that the primitives are right by being usable from Claude Code via stdio.
4. **VSCode extension — tree view + commands first.** The smallest useful surface. Imports `core`, no webviews yet.
5. **VSCode extension — Kanban + spec detail webviews.** Larger UI investment, but the foundation is real by this point.
6. **Pre-commit hook + CI check.** Closes the regen-at-commit story.
7. **Dogfood.** The repo uses Zettelgeist on itself. v0.2 backlog gets specs.

## 14. What this design does *not* commit to

- That the format is final. v0.1 may change before v1.0; that's why it's `0.x`.
- That the VSCode extension is the long-term primary surface. It's the v0.1 reference. Other surfaces are explicitly invited to implement against the spec. (Plan 2.5 adds a browser-based viewer that may obviate parts of the VSCode extension's scope.)
- That the MCP tool surface is final. Adding tools is non-breaking; renaming or removing them is a breaking change worth a major version bump.
- That orchestration will never be in scope. v0.2 may add a "click to run agent" path with explicit LLM ownership. v0.1 just doesn't include it.

## 15. Note: storage is markdown; interaction is HTML

**Storage**: markdown. Always. The repo is the database. Specs (`requirements.md`, `tasks.md`, `handoff.md`, lenses) and metadata (`.zettelgeist.yaml`, `INDEX.md`) all live as markdown/YAML committed to git. This is the only layer the format spec describes.

**Interaction**: HTML, when humans are involved. The thesis from [Anthropic's Claude Code team's HTML-effectiveness post](https://thariqs.github.io/html-effectiveness/) applies: agents synthesize richer documents in HTML than in markdown (charts, diagrams, interactive playgrounds), and humans actually read HTML where they skim markdown. So tools render the markdown to HTML on demand for any human-facing surface — board view, Kanban, spec detail, status report, sharable PR-explainer artifact.

**Two-way street**: any UI mutation (tick a checkbox, edit frontmatter, mark blocked) translates to a markdown edit + git commit. The viewer/extension is one of N possible UIs. Restart any UI; the state is unchanged because it never lived in the UI.

**The reference rendering surface** is the local viewer shipped by the `zettelgeist` CLI (Plan 2 §10) — a single HTML/CSS/JS bundle bundled into the npm package, served by `zettelgeist serve` against any Zettelgeist repo. Never committed to user repos by default. Customizable via `.zettelgeist/render-templates/` — per Plan 2 §10's four-layer model:

- Layer 0 (bundled defaults) — ships with the tool
- Layer 1 (theme name in `.zettelgeist.yaml`) — `viewer_theme: light | dark | system`
- Layer 2 (CSS override at `.zettelgeist/render-templates/viewer.css`) — additive to bundled CSS
- Layer 3 (full template override at `.zettelgeist/render-templates/viewer/`) — replaces the bundled viewer entirely (deferred to v0.2+)

This keeps the "clone the repo and you have the entire board" property intact: cloning a vanilla Zettelgeist repo never adds viewer code.

**Other rendering surfaces** (VSCode webviews, IDE plugins, hosted forge views, mobile apps, Tauri desktop apps) are encouraged and may even reuse the same viewer bundle by injecting their own backend transport. They share only the format spec + conformance fixtures as their contract — never the reference viewer's HTML/CSS.
