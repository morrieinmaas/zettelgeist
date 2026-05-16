# v0.2+ backlog

Items deferred from Plan 1 + Plan 2 + Sprint reviews. Not commitments — a tracking surface. Several have graduated to actual `specs/<name>/` entries in this repo, which is where the canonical state lives.

## Format

- **PR / branch / worktree linkage** *(shipped 2026-05)* — `pr`, `branch`, `worktree` frontmatter fields. Surfaced as badges on board cards, editable via the per-card edit modal. No spec doc — just frontmatter.
- **Wiki-style links** *(shipped 2026-05)* — inline `[[name]]` references in any markdown body, navigable in the viewer. Resolves against specs first, then docs by basename; missing targets render in a different style. ([specs/wiki-links/](../specs/wiki-links/))
- **Frontmatter status honored for all 7 values** *(shipped 2026-05)* — `deriveStatus` previously only honored `blocked` / `cancelled`, silently ignoring the other 5 overrides; now any of the 7 wins over derivation. Board drag-to-column writes the override and the card stays put.
- ~~Saved views~~ *(cancelled — see [specs/saved-views/requirements.md](../specs/saved-views/requirements.md))* — Persisted filter expressions don't add value in a workflow where every user has an MCP-capable agent that can query specs directly. `part_of` already exists for declaring group membership.
- **Events catalogue** (webhooks + MCP event stream) — frozen payload shapes, fixture coverage. ([specs/events-catalogue/](../specs/events-catalogue/))
- `auto_merge: true` triggering automated merge behavior.
- Suggestion-branch contribution flow (per-user draft branches for non-coders).
- Multi-repo specs with cross-repo identifiers.
- Richer non-text content in `requirements.md` (image embeds, decision tables).
- **`.claim` file flips derived status** *(shipped 2026-05-14)* — `scanClaimedSpecs()` in core walks each spec dir and reports any present `.claim` (legacy) or `.claim-<actor>` (v0.2 per-actor) file. CLI + MCP read paths now populate `RepoState.claimedSpecs` from disk, so claimed specs derive to `in-progress` correctly.
- **Per-actor claim files** *(shipped 2026-05-14)* — `claim_spec({name, agent_id})` now writes `.claim-<sanitized-slug>` so two machines claiming concurrently don't conflict. Legacy `.claim` still recognised on read for back-compat. See [specs/per-actor-claim/](../specs/per-actor-claim/).
- **INDEX.md auto-resolved on merge** *(shipped 2026-05-16)* — `install-hook` now also writes `specs/INDEX.md merge=union` to `.gitattributes` and a `post-merge` hook that runs `regen` against the fully-merged tree, committing the result as `[zg] regen INDEX after merge`. Originally specced as a custom merge driver; abandoned because git invokes drivers per-file before applying clean adds from the other branch (driver only sees a partial tree). See [specs/index-merge-driver/](../specs/index-merge-driver/).
- **Distributed-conflict robustness suite (in progress)** — INDEX done; remaining: `tasks-merge-driver`, `frontmatter-merge-driver`, `sync-command`, `tui-surface`. Specs are all written under `specs/`.

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
- **Conformance suite expansion** *(shipped 2026-05)* — fixtures 12–42 cover edge cases for names, frontmatter, task syntax, status derivation, graph, config, encoding, and integration. Brings the contract from 11 to 42 byte-exact pinned scenarios.
- Add a Rust port of `@zettelgeist/core` (conformance fixtures are the contract).
- Bundle CRDT-based concurrent editing (much later).
