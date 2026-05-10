# Changelog

All notable changes to Zettelgeist are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the format version is independent of any single package's version.

## [Unreleased]

(Tracked in [docs/v02-backlog.md](docs/v02-backlog.md).)

## [0.1.0] — 2026-05-09

### Format spec

- v0.1 of the format spec at [spec/zettelgeist-v0.1.md](spec/zettelgeist-v0.1.md): 14 normative sections, RFC-style, with a rule-to-fixture map.
- 11 conformance fixtures covering empty repo, single spec, inline tags, cycles, blocked overrides, human-region preservation, invalid frontmatter, empty spec folders, bad config, custom specs_dir, and mixed errors.
- Reserved paths under `.zettelgeist/` for tool-managed state and user-managed customization.

### Reference implementation

- `@zettelgeist/core` 0.1.0 — pure TS format library: `parseFrontmatter`, `parseTasks`, `loadSpec`, `loadAllSpecs`, `deriveStatus`, `buildGraph`, `validateRepo`, `regenerateIndex`, `loadConfig`, `runConformance`. No I/O dependencies.
- `@zettelgeist/fs-adapters` 0.1.0 — disk + in-memory FsReader (internal package).
- `@zettelgeist/cli` 0.1.0 — `zettelgeist` binary with 5 commands: `regen` (with content-aware cache via git tree SHA), `validate`, `install-hook`, `serve`, `export-doc`. JSON envelope on every command.
- `@zettelgeist/mcp-server` 0.1.0 — `zettelgeist-mcp` stdio MCP server with 15 tools (4 read, 5 write, 4 state, 2 synthesis-context).
- `@zettelgeist/viewer` (internal) — vanilla HTML/CSS/JS bundle. Kanban board, spec detail (4 tabs), Mermaid graph, docs view, drag-to-blocked modal, light/dark themes, mobile-responsive. Path-traversal guarded; sanitized via DOMPurify.

### Tooling

- GitHub Actions CI: typecheck + tests + conformance + builds + `regen --check` + Playwright viewer e2e.
- Husky pre-commit template + `zettelgeist install-hook` self-installer with smart-merge marker block.
- Pluggable customization at `.zettelgeist/render-templates/` (themes, CSS overrides, export template overrides).

### Security

- All file-reading and -writing endpoints (REST + MCP) guard against path traversal via `safeJoin`.
- Markdown rendered to HTML via `marked` is sanitized via DOMPurify before `innerHTML` assignment.
- HTTP server binds to `127.0.0.1` only.

### Known limitations (deferred to v0.2+)

- Viewer Layer 3 (full template override) is not yet implemented.
- JS plugin templates (sandboxing concern) deferred.
- MCP SDK migration from legacy `Server` to `McpServer` deferred.
- Multi-client MCP (single client at a time today).
- VSCode extension reusing the viewer bundle (Plan 3 / Plan 4).
- Events (webhooks / MCP event stream).
- Suggestion-branch contribution flow.
- Multi-repo specs.

[Unreleased]: https://github.com/morrieinmaas/zettelgeist/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/morrieinmaas/zettelgeist/releases/tag/v0.1.0
