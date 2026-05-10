# v0.2+ backlog

Items deferred from Plan 1 + Plan 2 + Sprint reviews. Not commitments — a tracking surface.

## Format

- Events catalogue (webhooks + MCP event stream) — frozen payload shapes, fixture coverage.
- `auto_merge: true` triggering automated merge behavior.
- Suggestion-branch contribution flow (per-user draft branches for non-coders).
- Multi-repo specs with cross-repo identifiers.
- Richer non-text content in `requirements.md` (image embeds, decision tables).

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
