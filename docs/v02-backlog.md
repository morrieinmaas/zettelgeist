# v0.2+ backlog

Items deferred from Plan 1 + Plan 2 + Sprint reviews. Not commitments — a tracking surface. Several have graduated to actual `specs/<name>/` entries in this repo, which is where the canonical state lives.

## Format

- **PR / branch / worktree linkage** *(shipped 2026-05)* — `pr`, `branch`, `worktree` frontmatter fields. Surfaced as badges on board cards, editable via the per-card edit modal. No spec doc — just frontmatter.
- **Wiki-style links between specs** — inline `[[spec-name]]` references in prose, collected by the parser, navigable in the viewer. Inspired by Rowboat / Obsidian / the zettelkasten model the project name invokes. ([specs/wiki-links/](../specs/wiki-links/))
- **Saved views** — config-defined live queries over the spec set: "blockers I own", "stale > 30d", "everything in `payments`". Rendered as additional sections in `INDEX.md` and as filter chips in the viewer. ([specs/saved-views/](../specs/saved-views/))
- **Events catalogue** (webhooks + MCP event stream) — frozen payload shapes, fixture coverage. ([specs/events-catalogue/](../specs/events-catalogue/))
- `auto_merge: true` triggering automated merge behavior.
- Suggestion-branch contribution flow (per-user draft branches for non-coders).
- Multi-repo specs with cross-repo identifiers.
- Richer non-text content in `requirements.md` (image embeds, decision tables).
- `.claim` file actually flips derived status — today the CLI/viewer's `claimedSpecs` is hardcoded to empty; should scan the spec folder for non-stale `.claim` files at status-derivation time.

## Tools

- VSCode extension that reuses `@zettelgeist/viewer` via postMessage backend.
- Standalone hosted viewer (S3 + Lambda or similar) reusing the bundle.
- Layer 3 viewer template override (full SPA replacement at `.zettelgeist/render-templates/viewer/`).
- JS plugin templates (sandboxed user-supplied JS for export rendering).
- Multi-client MCP server (concurrent agents).
- MCP SDK migration from `Server` to `McpServer` (legacy -> current API).
- Bundle Mermaid into the viewer (currently lazy-loaded from CDN).
- Empty-state UX in the viewer ("create your first spec" affordance).
- Per-command help text in the CLI (`zettelgeist regen --help`).

## Distribution

- Publish to npm (currently publishable but not yet pushed).
- Set up the GitHub Pages site for the spec.
- Ship a `npx create-zettelgeist-repo` scaffolder.

## Polish

- Unify `installPreCommitHook` between CLI and MCP-server (currently duplicated).
- Reconcile `agent_id` (MCP) vs `agentId` (REST) field naming.
- Add accessibility tests + ARIA attributes to the viewer.
- Add a Rust port of `@zettelgeist/core` (conformance fixtures are the contract).
- Bundle CRDT-based concurrent editing (much later).
