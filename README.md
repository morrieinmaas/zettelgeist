# Zettelgeist

> **Spec-driven project management where LLM agents and humans collaborate as equals.** Your repo is the database, markdown is the source of truth — agents work via MCP, humans via an HTML viewer or VSCode extension, every action is a git commit.

[![CI](https://github.com/morrieinmaas/zettelgeist/actions/workflows/ci.yml/badge.svg)](https://github.com/morrieinmaas/zettelgeist/actions/workflows/ci.yml)
[![npm: @zettelgeist/cli](https://img.shields.io/npm/v/@zettelgeist/cli?label=%40zettelgeist%2Fcli)](https://www.npmjs.com/package/@zettelgeist/cli)
[![npm: @zettelgeist/mcp-server](https://img.shields.io/npm/v/@zettelgeist/mcp-server?label=%40zettelgeist%2Fmcp-server)](https://www.npmjs.com/package/@zettelgeist/mcp-server)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/morriearty-zg.zettelgeist?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=morriearty-zg.zettelgeist)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![format_version](https://img.shields.io/badge/format__version-0.1-orange.svg)](spec/zettelgeist-v0.1.md)
[![conformance fixtures](https://img.shields.io/badge/conformance%20fixtures-42-brightgreen.svg)](spec/conformance/fixtures/)

Zettelgeist is a portable file format plus a small reference toolchain for tracking work the way you already track code — as plain files, in git, diffable and grep-able. A Kanban board, a dependency graph, claimable tickets, agent handoff notes, and an HTML viewer ship in the box. Every "click" in the UI is a git commit; everything else is markdown.

> **📜 The format is the contract.**
> [**`spec/zettelgeist-v0.1.md`**](spec/zettelgeist-v0.1.md) defines what makes a directory a Zettelgeist repo — 14 sections, short enough to read in one sitting. The [42 conformance fixtures](spec/conformance/fixtures/) are the executable contract any implementation can validate against. **This repository is one reference implementation**; rewriting the toolchain in Rust, Python, or anything else is a stated goal of v0.2.

---

## Table of contents

- [Why](#why)
- [Quickstart](#quickstart)
- [How it works](#how-it-works)
- [Anatomy of a spec](#anatomy-of-a-spec)
- [Workflows](#workflows)
- [Reference: CLI, MCP, REST](#reference-cli-mcp-rest)
- [Configuration](#configuration)
- [Customizing the viewer](#customizing-the-viewer)
- [Architecture](#architecture)
- [Development](#development)
- [Status and roadmap](#status-and-roadmap)
- [License and acknowledgments](#license-and-acknowledgments)

---

## Why

Issue trackers (Jira, Linear, GitHub Projects) assume a human moves the card. An agent working on a ticket has to round-trip to an external API to update state — the state lives in a database, not next to the code. That round-trip is friction every coding agent currently pays, and it's the reason "drive a Jira board from an LLM" feels worse than it should.

Spec-driven-development tools (Kiro, spec-kit, EARS) get the file part right: specs are markdown, version-controlled, agent-mutable. But they punt on the non-coder problem — a PM or designer can't open VSCode to tick a checkbox or comment on a draft.

Zettelgeist makes the **repo own the state** (markdown files, git-diffable, agent-mutable, prose-friendly) and ships a **clickable HTML viewer for non-coders** that runs locally and never gets committed to user repos. Every UI mutation is a markdown edit plus a commit; restart the UI and nothing is lost because nothing lived in the UI.

---

## Quickstart

### Prerequisites

You'll need a few things on your `PATH` first:

| Tool | Version | What for | How to install (macOS) |
| --- | --- | --- | --- |
| **Node.js** | ≥ 20 | runtime for the CLI, MCP server, build scripts | `brew install node` or [nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm) |
| **pnpm** | ≥ 9 | workspace package manager | `npm i -g pnpm` or `brew install pnpm` or [corepack](https://nodejs.org/api/corepack.html) (`corepack enable`) |
| **git** | any recent | every UI mutation produces a commit | usually pre-installed; `brew install git` otherwise |
| **just** *(optional)* | any | one-liner dev recipes (`just demo`, `just ext`, …) | `brew install just` or `cargo install just`. Not required — `pnpm` scripts cover the same recipes. |
| **VSCode** *(optional)* | ≥ 1.85 | only if you want the panel-based extension UI | <https://code.visualstudio.com/> |

Linux is the same minus Homebrew; Windows works with WSL or Git Bash.

### See it work in 30 seconds

```bash
git clone https://github.com/morrieinmaas/zettelgeist.git
cd zettelgeist
pnpm install         # one-time
just demo            # or `pnpm demo` if you don't have `just`
```

Opens the viewer at <http://127.0.0.1:7681> with a fully populated [example repo](examples/demo/README.md): 10 specs across all status columns, a dependency graph, lenses, inline tags, blocked-by reasons, PR / branch / worktree badges, the works.

### Use it on your own repo

```bash
npm i -g @zettelgeist/cli
cd your-repo
echo 'format_version: "0.1"' > .zettelgeist.yaml
mkdir specs                               # spec files live here
zettelgeist install-hook                  # optional: keeps specs/INDEX.md current on each commit
zettelgeist serve                         # opens the viewer in your browser
```

That's it. The viewer renders an empty board. Create your first spec from the UI, or write one by hand:

```bash
mkdir specs/my-first-spec
cat > specs/my-first-spec/requirements.md <<'EOF'
---
depends_on: []
---
# My first spec

## Why
Because.

## Acceptance criteria
- WHEN you read this
- THE SYSTEM SHALL feel obvious
EOF

cat > specs/my-first-spec/tasks.md <<'EOF'
- [ ] 1. Write the spec
- [ ] 2. Ship the thing
EOF

zettelgeist regen     # rebuilds specs/INDEX.md
```

Refresh the viewer; the card appears in the "Planned" column.

### Hook it up to an agent (MCP)

Add `zettelgeist-mcp` to your Claude Code (or other MCP client) config:

```json
{
  "mcpServers": {
    "zettelgeist": {
      "command": "npx",
      "args": ["@zettelgeist/mcp-server"]
    }
  }
}
```

Then ask the agent to `list_specs`, `tick_task`, `claim_spec`, `set_status`, etc. Full tool list: [packages/mcp-server/SKILL.md](packages/mcp-server/SKILL.md).

### Install the agent skill

The MCP server already lists its tools — but agents work much better if they also have the *workflow* (claim → read → mutate → handoff → release) and the v0.1 format rules in their context. Three ways to ship that:

```bash
zettelgeist install-skill                            # ~/.claude/skills/zettelgeist/SKILL.md (system-wide for this user)
zettelgeist install-skill --scope project            # <repo>/.claude/skills/zettelgeist/SKILL.md (commit for the team)
zettelgeist install-skill --scope agents-md          # <repo>/AGENTS.md (cross-tool: Codex, Copilot CLI, etc.)
```

The `agents-md` scope smart-merges into an existing `AGENTS.md` between marker comments — anything else in that file is preserved. MCP-aware clients also get the same content automatically via the `prompts/list` capability — no install needed.

### Use it inside VSCode (extension)

The kanban board, dependency graph, and editable detail view all run inside a VSCode panel — the Activity Bar gets its own Zettelgeist icon with a Specs sidebar tree, and the board opens as a regular editor tab.

There's no Marketplace publish yet, so you run it from source:

1. **Open this repo in VSCode.**
2. **Build the extension** (terminal inside VSCode):

   ```bash
   just ext
   ```

   This bundles the viewer + the extension and prints next-step instructions.
3. **Open the Run and Debug panel** — `Cmd+Shift+D` (macOS) / `Ctrl+Shift+D` (Linux/Windows). VSCode reads `.vscode/launch.json` from the repo root.
4. **Pick a launch config** from the dropdown at the top of the panel:
   - **Zettelgeist: Extension Development Host (demo)** — runs against `examples/demo/`
   - **Zettelgeist: Extension Development Host (this repo)** — runs against the outer repo (dogfood mode)
5. **Hit the green play button** (or press `F5` while the Run panel is focused). A second VSCode window opens — the **Extension Development Host** — with the extension installed.
6. **In the new window:** click the Zettelgeist icon in the Activity Bar (left edge), or run `Zettelgeist: Open Board` from the command palette (`Cmd+Shift+P`).

Iterating: after changing extension code, run `just ext` again, then in the dev-host window press `Cmd+R` (Reload Window) to pick up the change. For continuous rebuilds, `just ext-watch` keeps esbuild watching the extension source.

The extension also auto-activates whenever a workspace contains a `.zettelgeist.yaml`, so once published you'd just install it normally. See [packages/vscode-extension/README.md](packages/vscode-extension/README.md) for the commands it contributes + configuration.

---

## How it works

### The mental model

```
+-----------------------+    +-----------------------+
|  zettelgeist serve    |    |  zettelgeist-mcp      |
|  (HTTP + viewer)      |    |  (stdio MCP server)   |
+----------+------------+    +----------+------------+
           |                            |
           +-------+ both call +--------+
                   |                    |
               @zettelgeist/core (parse / derive / validate / regen)
                   |
                   v
            specs/*/*.md committed to git  ←  source of truth
```

- **Storage** = markdown files in your repo. Git-diffable, agent-mutable, human-readable.
- **Surfaces** = HTML when humans are involved (the viewer); JSON-RPC when agents are.
- **State** = whatever the markdown says right now. The viewer holds no state; restart it and it renders identically.

### Status is part-derived, part-overridden

Each spec has one of 7 statuses: `draft`, `planned`, `in-progress`, `in-review`, `done`, `blocked`, `cancelled`. The status the board shows is **computed** from the spec's tasks + claim + merge state — unless `status:` is set in the spec's frontmatter, in which case the frontmatter wins. This is the layer that makes the board feel responsive without losing the "tasks are the truth" property:

| Signal | Effect |
|---|---|
| Tick all tasks | derived → `in-review` (or `done` if merged) |
| Tick some tasks | derived → `in-progress` |
| Drop a `.claim` file | derived → `in-progress` |
| Drag a card on the board | writes `status: <target>` to frontmatter; pins the card there |
| "Edit details" → set Status to `(auto)` | clears the override; falls back to derived |

### Every mutation is a markdown edit plus a commit

Click "move card to In Progress" in the viewer. What actually happens:

1. Viewer issues `POST /api/specs/<name>/status` (REST) — or an agent calls `set_status` (MCP) — with the target status.
2. Server merges `status: <target>` into the spec's `requirements.md` frontmatter (preserving everything else).
3. `regen` rebuilds `specs/INDEX.md`. Its cache key is a content hash of the working tree, so uncommitted edits invalidate it cleanly.
4. `git add` + `git commit -m "[zg] set-status: <name>"`.
5. Response carries the new commit SHA.

Restart the viewer and the card is still in In Progress — because the change isn't in the viewer, it's in `requirements.md`, which is in git.

### The viewer ships with the tool, not the user's repo

The viewer is a static bundle hosted by `zettelgeist serve`. User repos add at most a `.zettelgeist/` folder with a regen cache (gitignored) and an optional `render-templates/` for visual overrides. No SPA boilerplate, no `node_modules`, no committed viewer code.

---

## Anatomy of a spec

```
specs/user-auth/
  requirements.md       # frontmatter (status, pr, branch, depends_on, ...) + body
  tasks.md              # "- [ ] N. text #tag" lines; ticking writes a commit
  handoff.md            # optional: end-of-session notes the next agent picks up
  lenses/
    design.md           # optional: domain-specific views (security, UX, ops, ...)
    security-review.md
  .claim                # gitignored: per-machine lock so two agents don't collide
```

A spec is *valid* if at least one of `requirements.md`, `tasks.md`, `handoff.md`, or `lenses/*.md` exists.

**`requirements.md`** carries the frontmatter. Recognized fields:

```yaml
---
status: in-progress         # optional override; if absent, status is derived
depends_on: [billing-ui]    # other spec names; drives the dependency graph
part_of: identity           # epic / area
replaces: legacy-auth       # explains cancelled specs
blocked_by: "Waiting on IDP creds"
pr: https://github.com/acme/repo/pull/142
branch: feat/user-auth
worktree: ../zg-user-auth
---
```

**`tasks.md`** is a flat list of numbered checkbox items:

```markdown
- [x] 1. Stand up the OIDC integration
- [ ] 2. Wire CSRF on the new session middleware
- [ ] 3. Get security sign-off  #human-only
- [ ] 4. Capacity test against current peak  #skip
```

Tags: `#human-only`, `#agent-only`, `#skip` (excluded from progress counting). Tick / untick from the viewer, the CLI, or MCP — each one is its own commit.

**`specs/INDEX.md`** is *generated*, not authored. It contains the kanban state table plus the dependency graph (Mermaid). The pre-commit hook keeps it in sync; `zettelgeist regen --check` is the CI guard.

---

## Workflows

### As a human

Pick a surface:

- **`zettelgeist serve`** — viewer opens at <http://127.0.0.1:7681> in your browser.
- **VSCode extension** — `Zettelgeist: Open Board` from the command palette opens the same viewer in a side panel.

Then:

1. Drag cards across columns, click the pencil to edit status / PR / branch, tick task checkboxes, write end-of-session notes in the Handoff tab.
2. Tick acceptance-criteria checkboxes (`- [ ] WHEN …`) inline in the rendered Requirements body — no edit-mode needed.
3. Link specs with wiki syntax: `[[other-spec]]` in any markdown body becomes a clickable router link.
4. Every action is a commit; pull / push as usual.

### As an agent (Claude Code etc.)

```text
list_specs → claim_spec(name) → write a .claim file
read_spec(name) / read_spec_file(name, "tasks.md") → understand the work
write_spec_file / tick_task / write_handoff → make progress
release_spec(name) → drop the claim
prepare_synthesis_context → snapshot for a status report
write_artifact → ship a rendered HTML report next to the repo
```

Agents see the same data as humans, mutate through the same regen + commit pipeline, and never need an external API.

### Mixed

The interesting case. A PM drags a spec from Draft to Planned; an agent claims it; the agent ticks tasks; the PM reviews the handoff in the viewer; the spec auto-derives to `in-review` when all tasks are checked; a reviewer merges the PR named in the spec's `pr:` field; the next regen flips it to `done`. Nobody had to leave their tool of choice.

---

## Reference: CLI, MCP, REST

### CLI

| Command | Description |
|---|---|
| `zettelgeist regen [--check]` | Regenerate `specs/INDEX.md`. `--check` exits non-zero if stale. |
| `zettelgeist validate` | Validate the repo against the format spec. |
| `zettelgeist install-hook [--force]` | Install the pre-commit hook (smart-merge with any existing hook). |
| `zettelgeist install-skill [--scope user\|project\|agents-md] [--force]` | Install the agent workflow skill. `user` (default) is system-wide for this user; `project` is per-repo and commit-friendly; `agents-md` smart-merges into `AGENTS.md` for cross-tool coverage (Codex, Copilot CLI). |
| `zettelgeist serve [--port N] [--no-open]` | Launch the local viewer (default port 7681). |
| `zettelgeist export-doc <path> [--template T]` | Render a markdown file to standalone HTML. |

Per-command help: `zettelgeist <command> --help`.

### MCP tools (16)

`list_specs`, `read_spec`, `read_spec_file`, `validate_repo`, `write_spec_file`, `tick_task`, `untick_task`, `set_status`, `patch_frontmatter`, `write_handoff`, `regenerate_index`, `claim_spec`, `release_spec`, `install_git_hook`, `prepare_synthesis_context`, `write_artifact`.

Full schemas: [packages/mcp-server/SKILL.md](packages/mcp-server/SKILL.md).

### REST (served by `zettelgeist serve`)

| Method | Path | Body | Effect |
| --- | --- | --- | --- |
| `GET` | `/api/specs` | — | List specs with derived status, progress, PR / branch / worktree. |
| `GET` | `/api/specs/:name` | — | Full spec detail. |
| `DELETE` | `/api/specs/:name` | — | Remove the entire spec folder; regen + commit. |
| `GET` | `/api/specs/:name/files/:relpath` | — | Read any file inside the spec dir. |
| `PUT` | `/api/specs/:name/files/:relpath` | `{content}` | Write any file; regen + commit. |
| `POST` | `/api/specs/:name/tasks/:n/tick` | — | Tick task N; commit. |
| `POST` | `/api/specs/:name/tasks/:n/untick` | — | Untick task N; commit. |
| `POST` | `/api/specs/:name/status` | `{status, reason?}` | Set or clear the status override; commit. |
| `PATCH` | `/api/specs/:name/frontmatter` | `{patch}` | Merge a frontmatter patch (excluding `status` / `blocked_by`); commit. |
| `PUT` | `/api/specs/:name/handoff` | `{content}` | Write `handoff.md`; commit. |
| `POST` | `/api/specs/:name/claim` | `{agent_id?}` | Write the `.claim` file. |
| `POST` | `/api/specs/:name/release` | — | Delete the `.claim` file. |
| `GET` | `/api/docs` | — | List markdown docs under `docs/`, `spec/`, and root `README.md`. |
| `GET` | `/api/docs/:path` | — | Read a doc's raw markdown + title. |
| `PUT` | `/api/docs/:path` | `{content}` | Overwrite a doc; commit. |
| `POST` | `/api/docs/:path/rename` | `{newPath}` | Rename or move a doc. Refuses to overwrite (409). |
| `GET` | `/api/validation` | — | Run `validate_repo`; returns the list of structural errors. |
| `POST` | `/api/regenerate` | — | Rebuild `INDEX.md`. |

All write endpoints are guarded against path traversal (`..` in paths returns `403`) and produce one commit per request.

---

## Configuration

`.zettelgeist.yaml` at the repo root:

```yaml
format_version: "0.1"          # required
specs_dir: specs               # default "specs"
viewer_theme: system           # light | dark | system (default)
```

Per-user overrides:

- The navbar's ☾ / ☀ button toggles the theme and persists to `localStorage` (`zg.theme`). User choice beats config beats system preference.
- `.zettelgeist/render-templates/user-overrides.css` (gitignored if you want) is loaded by the viewer if present, last in the cascade.

---

## Customizing the viewer

The viewer ships with the tool; user repos never auto-add viewer code. Customization is layered:

| Layer | What | Status |
|---|---|---|
| 0 | Bundled defaults | Ships in v0.1 |
| 1 | `viewer_theme: light \| dark \| system` in `.zettelgeist.yaml` | Ships in v0.1 |
| 2 | `.zettelgeist/render-templates/{viewer,export}.css` overrides | Ships in v0.1 |
| 3 | `.zettelgeist/render-templates/export.html` template (viewer template override planned) | Export in v0.1; viewer override in v0.2+ |

---

## Architecture

```text
packages/
  core/          Pure-TS format library. Parse, derive, validate, regen. No I/O.
  fs-adapters/   Disk + in-memory readers. Same interface for tests and CI.
  cli/           `zettelgeist` binary. Owns `serve`, `regen`, `validate`, `export-doc`.
  mcp-server/    `zettelgeist-mcp` binary. Stdio MCP using `@modelcontextprotocol/sdk`.
  viewer/        Vanilla HTML/CSS/TS bundle. Talks to `window.zettelgeistBackend`.
  git-hook/      Smart-merge pre-commit hook installer (shared by CLI + MCP).
spec/
  zettelgeist-v0.1.md            Normative format spec.
  conformance/fixtures/          11 fixtures any implementation can validate against.
  conformance/harness/           Runs the fixtures.
examples/demo/                   The `just demo` repo.
docs/                            Architecture, design narrative, v0.2 backlog.
```

The viewer talks to a `ZettelgeistBackend` interface ([packages/viewer/src/backend.ts](packages/viewer/src/backend.ts)). The same bundle works behind `zettelgeist serve` (REST shim injected at page load), a future VSCode webview (postMessage shim), or a hosted SaaS (HTTPS shim). See [docs/architecture.md](docs/architecture.md) for depth.

---

## Development

```bash
git clone https://github.com/morrieinmaas/zettelgeist.git
cd zettelgeist
pnpm install

pnpm -r typecheck       # strict TS across the workspace
pnpm -r test            # 309 unit + integration tests
pnpm conformance        # 42 format conformance fixtures
pnpm --filter @zettelgeist/cli build
pnpm --filter @zettelgeist/cli test:e2e   # Playwright e2e against the running viewer

# Run the demo against your local build
just demo
```

Useful `just` recipes: `just build`, `just test`, `just demo`, `just demo-reset`, `just install-hook`, `just export-docs`. Run `just` with no arguments to list them.

Contributing guidelines and the workflow checklist live in [CONTRIBUTING.md](CONTRIBUTING.md). New features start as a spec under `specs/` — yes, the repo dogfoods.

---

## Status and roadmap

- **Format**: stable for v0.1. Future minor versions add fields, error codes, and rules in a backwards-compatible way.
- **Reference implementation**: passes all 42 conformance fixtures + 309 unit/integration tests. CI green on every commit to `main`.
- **Distribution**: `npm publish`-ready for `@zettelgeist/cli`, `@zettelgeist/mcp-server`, `@zettelgeist/core`. Not yet pushed to a registry — install from source for now.
- **v0.2 backlog**: see [docs/v02-backlog.md](docs/v02-backlog.md). Most v0.2 items have shipped (wiki-links, VSCode extension, editable everything, per-card delete, deriveStatus-for-all-7-values, 42-fixture conformance suite). Remaining: events catalogue, `auto_merge` flag, `.claim`-flips-status.

---

## Documentation

- [Format spec](spec/zettelgeist-v0.1.md) — the contract any implementation follows.
- [Architecture](docs/architecture.md) — package responsibilities, data flow, the host-agnostic viewer.
- [Design narrative](docs/design.md) — the long-form "why" pitch.
- [CLI reference](packages/cli/README.md) — every command and flag.
- [MCP reference](packages/mcp-server/README.md) — every tool with its Zod schema.
- [SKILL.md](packages/mcp-server/SKILL.md) — agent-readable manifest.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, workflow, conventions.
- [CHANGELOG.md](CHANGELOG.md) — release history.

---

## License and acknowledgments

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the full text.

> **No warranty.** This software is provided **"AS IS", without warranty of any kind**, express or implied — including, without limitation, any warranties of merchantability, fitness for a particular purpose, correctness, accuracy, or non-infringement. In no event shall the authors or contributors be liable for any claim, damages, or other liability arising from the use of this software. See sections 7 and 8 of the LICENSE file for the operative text.

Zettelgeist converges on conventions established by [Kiro](https://kiro.ai), [spec-kit](https://github.com/github/spec-kit), [EARS](https://www.iaria.org/conferences2013/filesICCGI13/Tutorial%20Mavin.pdf), [Rowboat](https://github.com/rowboatlabs/rowboat), and Anthropic's [Claude Code team's HTML-effectiveness thesis](https://thariqs.github.io/html-effectiveness/). The name is a tip of the hat to Niklas Luhmann's zettelkasten — atomic notes, dense connections, value emerging from the graph rather than the file.
