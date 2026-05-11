# v0.2+ backlog

Items deferred from Plan 1 + Plan 2 + Sprint reviews. Not commitments — a tracking surface. Several have graduated to actual `specs/<name>/` entries in this repo, which is where the canonical state lives.

## Format

- **PR / branch / worktree linkage** *(shipped 2026-05)* — `pr`, `branch`, `worktree` frontmatter fields. Surfaced as badges on board cards, editable via the per-card edit modal. No spec doc — just frontmatter.
- **Wiki-style links** *(shipped 2026-05)* — inline `[[name]]` references in any markdown body, navigable in the viewer. Resolves against specs first, then docs by basename; missing targets render in a different style. ([specs/wiki-links/](../specs/wiki-links/))
- **Frontmatter status honored for all 7 values** *(shipped 2026-05)* — `deriveStatus` previously only honored `blocked` / `cancelled`, silently ignoring the other 5 overrides; now any of the 7 wins over derivation. Board drag-to-column writes the override and the card stays put.
- **Saved views** — config-defined live queries over the spec set: "blockers I own", "stale > 30d", "everything in `payments`". Rendered as additional sections in `INDEX.md` and as filter chips in the viewer. ([specs/saved-views/](../specs/saved-views/))
- **Events catalogue** (webhooks + MCP event stream) — frozen payload shapes, fixture coverage. ([specs/events-catalogue/](../specs/events-catalogue/))
- `auto_merge: true` triggering automated merge behavior.
- Suggestion-branch contribution flow (per-user draft branches for non-coders).
- Multi-repo specs with cross-repo identifiers.
- Richer non-text content in `requirements.md` (image embeds, decision tables).
- `.claim` file actually flips derived status — today the CLI/viewer's `claimedSpecs` is hardcoded to empty; should scan the spec folder for non-stale `.claim` files at status-derivation time.

## Tools

- **VSCode extension** *(shipped 2026-05)* — Activity Bar sidebar with a status-grouped Specs tree + deep-link routing; board / detail / graph / docs all render as a VSCode editor tab via webview hosting the existing `@zettelgeist/viewer` bundle. CSS variable bridge maps the viewer's Pico tokens onto `--vscode-*` so the panel adopts whatever editor theme is active. User settings: theme, defaultView, autoOpenBoard, serverPort + serverHost for the "Open in Browser" command.
- **Editable docs surface** *(shipped 2026-05)* — `docs/*.md` are first-class alongside specs: rendered inline, edit / rename via the sidebar, GFM checkboxes interactive in view mode.
- **Per-column "+" + per-card 🗑** *(shipped 2026-05)* — create specs with status-aware templates from the board, delete with a destructive-action confirm.
- **In-DOM modals replace native `prompt`/`confirm`/`alert`** *(shipped 2026-05)* — needed because VSCode webviews silently block the native APIs.
- **Empty-state UX** *(shipped 2026-05)* — board / detail tabs / graph all show inviting empty states with starter templates.
- **Per-command help text in the CLI** *(shipped 2026-05)* — `zettelgeist regen --help` etc.
- Standalone hosted viewer (S3 + Lambda or similar) reusing the bundle.
- Layer 3 viewer template override (full SPA replacement at `.zettelgeist/render-templates/viewer/`).
- JS plugin templates (sandboxed user-supplied JS for export rendering).
- Multi-client MCP server (concurrent agents).
- MCP SDK migration from `Server` to `McpServer` (legacy -> current API).
- Bundle Mermaid into the viewer (currently lazy-loaded from CDN).

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
