# Changelog

All notable changes to Zettelgeist are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the format version is independent of any single package's version.

## [Unreleased]

(Tracked in [docs/v02-backlog.md](docs/v02-backlog.md).)

## [0.1.0] — 2026-05-12

First public release. The format spec is frozen for v0.1; future minor versions add fields, error codes, and rules in a backwards-compatible way.

### Format spec

- v0.1 at [spec/zettelgeist-v0.1.md](spec/zettelgeist-v0.1.md): 14 normative sections, RFC-style, with a rule-to-fixture map.
- **42 conformance fixtures** (up from 11): edge-case names (unicode/numeric/nested), frontmatter (no/empty/unknown keys, all 7 status overrides, type mismatches), task line syntax (markers, checked variants, numeric prefix, tags, code-fence quirk), status derivation, graph (cycles, self-loops, missing deps, `part_of` clusters), config edge cases, encoding (CRLF / BOM / YAML folded scalars), and integration scenarios.
- Reserved paths under `.zettelgeist/` for tool-managed state and user-managed customization.

### Reference implementation

- `@zettelgeist/core` 0.1.0 — pure TS format library: `parseFrontmatter`, `parseTasks`, `loadSpec`, `loadAllSpecs`, `deriveStatus`, `buildGraph`, `validateRepo`, `regenerateIndex`, `loadConfig`, `runConformance`. No I/O dependencies.
- `@zettelgeist/fs-adapters` 0.1.0 — disk + in-memory FsReader (bundled into cli/mcp-server; not published independently).
- `@zettelgeist/cli` 0.1.0 — `zettelgeist` binary with 6 commands: `regen` (content-aware cache via git tree SHA), `validate`, `install-hook`, `install-skill`, `serve`, `export-doc`. JSON envelope on every command.
- `@zettelgeist/mcp-server` 0.1.0 — `zettelgeist-mcp` stdio MCP server with **16 tools** (4 read, 6 write, 4 state, 2 synthesis-context) and the `zettelgeist-workflow` prompt exposed via MCP `prompts/list`.
- `@zettelgeist/viewer` (internal) — vanilla HTML/CSS/JS bundle. Kanban board, editable spec detail (4 tabs), per-card delete, per-column "+", editable docs, Mermaid graph, drag-to-blocked modal, in-DOM modals (VSCode-webview safe), light/dark themes, mobile-responsive. Path-traversal guarded; sanitized via DOMPurify.

### Agent surface

- **Workflow skill** shipped via three install paths: `zettelgeist install-skill` writes `~/.claude/skills/zettelgeist/SKILL.md` (system-wide) by default; `--scope project` for per-repo `.claude/skills/`; `--scope agents-md` smart-merges into `AGENTS.md` (Codex, Copilot CLI, Claude Code fallback) between marker comments so other content is preserved.
- MCP-aware clients get the same skill content automatically via `prompts/list` — no filesystem install required.

### VSCode extension

- `@zettelgeist/vscode-extension` 0.1.0 — Activity Bar Specs tree, board/detail/graph/docs as VSCode editor tabs via webview hosting the viewer bundle. CSS variable bridge maps Pico tokens to `--vscode-*` for theme adoption. Settings for default view, auto-open, custom server port/host. "Open in Browser" spawns a local `zettelgeist serve`.

### Tooling

- GitHub Actions CI: typecheck + tests + conformance + builds + `regen --check` + Playwright viewer e2e.
- `zettelgeist install-hook` self-installer with smart-merge marker block.
- Pluggable customization at `.zettelgeist/render-templates/` (themes, CSS overrides, export template overrides).
- 309 unit/integration tests + 42 conformance fixtures across 8 packages.

### Security

- All file-reading and -writing endpoints (REST + MCP) guard against path traversal via `safeJoin`.
- Markdown rendered to HTML via `marked` is sanitized via DOMPurify before `innerHTML` assignment.
- HTTP server binds to `127.0.0.1` only by default; `serverHost` configurable in the VSCode extension.

### Known limitations (deferred to v0.2+)

- Viewer Layer 3 (full template override) is not yet implemented.
- JS plugin templates (sandboxing concern) deferred.
- MCP SDK migration from legacy `Server` to `McpServer` deferred.
- Multi-client MCP (single client at a time today).
- Events catalogue (webhooks / MCP event stream).
- `auto_merge: true` automated merge behaviour.
- `.claim` files flipping derived status (today `claimedSpecs` is hardcoded to empty).
- Suggestion-branch contribution flow.
- Multi-repo specs.

[Unreleased]: https://github.com/morrieinmaas/zettelgeist/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/morrieinmaas/zettelgeist/releases/tag/v0.1.0
