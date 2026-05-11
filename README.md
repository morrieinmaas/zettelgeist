# Zettelgeist

> Portable file format and tooling for spec-driven, agent-friendly project management. The repo is the database; markdown is the source of truth; HTML is the surface humans see.

[![CI](https://github.com/morrieinmaas/zettelgeist/actions/workflows/ci.yml/badge.svg)](https://github.com/morrieinmaas/zettelgeist/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![format_version](https://img.shields.io/badge/format__version-0.1-orange.svg)](spec/zettelgeist-v0.1.md)

**Status: v0.1 reference implementation.** The format is defined and conformance-tested. A reference CLI, MCP server, and HTML viewer ship together. The format itself is small enough to read in one sitting; multiple implementations are encouraged.

---

## Why

Issue trackers (Jira, Linear, GitHub Projects) assume humans move cards. An agent working on a ticket has to round-trip to an external API to update state — the state lives in a database, not next to the code. That round-trip is friction every coding agent currently pays.

File-based spec-driven development tools (Kiro, spec-kit, EARS) get the file part right: specs are markdown, version-controlled, agent-mutable. But they punt on the non-coder problem — a PM, a designer, a domain expert can't open VSCode to tick a checkbox or comment on a draft.

Zettelgeist makes the **repo own the state** (markdown files, git-diffable, agent-mutable, prose-friendly) and ships a **clickable HTML viewer for non-coders** that runs locally and never gets committed to user repos. Every UI mutation is just a markdown edit + commit; restart the UI and nothing is lost because nothing lived in the UI.

---

## Quick start

Pick the path that matches your role.

### As an end user (CLI)

```bash
npm i -g @zettelgeist/cli
cd your-repo
echo 'format_version: "0.1"' > .zettelgeist.yaml
zettelgeist install-hook        # optional: pre-commit hook keeps INDEX.md current
zettelgeist serve               # opens the HTML viewer in your browser
```

The viewer lets you create, edit, tick tasks, and mark specs blocked — all backed by markdown commits to your repo.

### As an agent (MCP)

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

Then ask the agent to `list_specs`, `tick_task`, `claim_spec`, etc. Full tool list: [packages/mcp-server/SKILL.md](packages/mcp-server/SKILL.md).

### As a contributor

```bash
git clone https://github.com/morrieinmaas/zettelgeist.git
cd zettelgeist
pnpm install
pnpm -r test            # 190+ unit tests
pnpm conformance        # 11 format conformance fixtures
pnpm --filter @zettelgeist/cli build
node packages/cli/dist/bin.js serve
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details.

---

## CLI commands

| Command | Description |
|---|---|
| `zettelgeist regen [--check]` | Regenerate `<specs_dir>/INDEX.md`. `--check` exits 1 on stale or missing. |
| `zettelgeist validate` | Validate the repo against the format spec; lists errors. |
| `zettelgeist install-hook [--force]` | Install the pre-commit hook (smart-merge with any existing hook). |
| `zettelgeist serve [--port N] [--no-open]` | Launch the local viewer on `http://127.0.0.1:7681`. |
| `zettelgeist export-doc <path> [--template T]` | Render a markdown file to standalone HTML. |

Run `zettelgeist <command> --help` for per-command arguments and flags.

---

## What's in v0.1

- **Format spec** ([spec/zettelgeist-v0.1.md](spec/zettelgeist-v0.1.md)) — RFC-style, 14 sections + rule-to-fixture map.
- **Conformance fixtures** ([spec/conformance/fixtures/](spec/conformance/fixtures/)) — 11 fixtures any implementation can validate against.
- **`@zettelgeist/cli`** — `regen` (with git tree-SHA cache), `validate`, `install-hook`, `serve` (HTTP server hosting the viewer), `export-doc` (mustache HTML templates).
- **`@zettelgeist/mcp-server`** — stdio MCP with 15 tools: read/write specs, tick tasks, claim/release, set status, regen, validate, install-hook, plus `prepare_synthesis_context` + `write_artifact` for agent-driven HTML report generation.
- **`@zettelgeist/viewer`** — vanilla HTML/CSS/JS bundle: Kanban board, spec detail (4 tabs), dependency graph (Mermaid), docs view, drag-to-blocked modal, light/dark themes, mobile-responsive.
- **`@zettelgeist/core`** — pure-TS format library. No I/O. Used by all surfaces.
- **GitHub Actions CI** — typecheck + tests + conformance + builds + `regen --check`.

---

## How it fits together

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
            specs/*/*.md committed to git  <- source of truth
```

- **Storage** = markdown files in your repo, git-diffable, agent-mutable, prose-friendly.
- **Interaction** = HTML when humans are involved (the viewer); JSON-RPC when agents are.
- **Every UI mutation** is a markdown edit + git commit. Restart any UI; the state is unchanged because it never lived in the UI.

---

## Customization

The viewer ships with the tool; user repos never auto-add viewer code. Optional layered customization at `.zettelgeist/render-templates/`:

| Layer | What | Status |
|---|---|---|
| 0 | Bundled defaults | Ships in v0.1 |
| 1 | `viewer_theme: light \| dark \| system` in `.zettelgeist.yaml` | Ships in v0.1 |
| 2 | `.zettelgeist/render-templates/{viewer,export}.css` overrides | Ships in v0.1 |
| 3 | `.zettelgeist/render-templates/export.html` template + future `viewer/` | Export ships in v0.1; viewer Layer 3 is v0.2+ |

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full diagram + package responsibilities + the pluggable-backend abstraction (`window.zettelgeistBackend`) that lets the same viewer bundle run inside `serve`, future VSCode webviews, and future hosted views.

---

## Status

- **Format**: stable for v0.1; future minor versions add fields, error codes, and rules in a backwards-compatible way.
- **Reference implementation**: passes all 11 conformance fixtures + 190 unit/integration tests.
- **Distribution**: `npm publish`-ready for `@zettelgeist/cli`, `@zettelgeist/mcp-server`, `@zettelgeist/core`. Not yet published to a registry.
- **Roadmap**: see [docs/v02-backlog.md](docs/v02-backlog.md) for what comes next (events, Layer 3 viewer override, multi-client MCP, JS plugin templates).

---

## Documentation

- [Format spec](spec/zettelgeist-v0.1.md) — the contract any implementation follows.
- [Architecture](docs/architecture.md) — package responsibilities, data flow, the host-agnostic viewer.
- [Design narrative](docs/design.md) — the "why" pitch (long-form).
- [CLI reference](packages/cli/README.md) — every command + flag.
- [MCP reference](packages/mcp-server/README.md) — every tool + Zod schema.
- [SKILL.md](packages/mcp-server/SKILL.md) — agent-readable manifest.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup + workflow.
- [CHANGELOG.md](CHANGELOG.md) — release history.

---

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

---

## Acknowledgments

This project converges on conventions established by [Kiro](https://kiro.ai), [spec-kit](https://github.com/github/spec-kit), [EARS](https://www.iaria.org/conferences2013/filesICCGI13/Tutorial%20Mavin.pdf), and Anthropic's [Claude Code team's HTML-effectiveness post](https://thariqs.github.io/html-effectiveness/). Plan 1 + Plan 2 design and execution drew on superpowers brainstorming, executing-plans, and subagent-driven-development skills.
