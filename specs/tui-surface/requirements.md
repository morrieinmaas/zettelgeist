---
status: planned
priority: medium
target_version: 0.2
---

# `@zettelgeist/tui` — terminal-native Zettelgeist surface

## Problem

Zettelgeist today has two surfaces: a web viewer (`zettelgeist serve`) and a
VS Code extension. Both render in browser tech. There is no first-class
keyboard-only, terminal-native experience for people who never leave the
terminal — and for many devs (and small servers / CI shells), opening a
browser or VS Code is overhead they don't want.

## Acceptance criteria

WHEN a user runs `zettelgeist tui` from a Zettelgeist repo,
THE SYSTEM SHALL render an interactive TUI showing the same logical views
the web viewer offers: kanban board, spec detail, dependency graph, docs.
Built with Ink (React for terminal) for accessibility and composability.

WHEN the user takes an action (tick a task, move a card, claim a spec) in the
TUI,
THE TUI SHALL invoke the same REST / MCP endpoints the web viewer uses
(or call `@zettelgeist/core` directly when running in-process). Every action
SHALL produce a commit, identically to the other surfaces.

WHEN the TUI starts and the repo has no `.zettelgeist.yaml`,
THE TUI SHALL offer the same setup wizard the CLI install hooks provide,
then re-enter the main view.

### Initial views (MVP)

- **Board** — columns for the 7 status values, cards = specs; arrow keys / `hjkl` navigation; `enter` to open spec detail; `m` to move a card (cycle to next column with `tab`, confirm with `m` or `enter`); `/` to filter
- **Detail** — tabs (requirements / tasks / handoff / lenses); `space` to tick a task; `e` to open the current file in `$EDITOR`; `q` back to board
- **Graph** — ASCII-rendered dependency graph (use a simple layered/topo layout; no Mermaid). Roughly aligned with web viewer's node selection
- **Docs** — directory tree of `docs/`; `enter` to render a doc inline; `e` to edit in `$EDITOR`

### Command palette

`?` opens a list of commands; type to filter; `enter` to invoke. Mirrors VS
Code-style discoverability.

### Configuration

Reads from `~/.config/zettelgeist/tui.toml` (optional): theme, keybindings,
default view, file-watcher poll interval.

## Non-goals

- A separate state store (the TUI is a *view* — markdown is still the source of truth)
- Mouse support (Ink supports it minimally; not a priority)
- Vim keybinding parity beyond `hjkl` navigation (deferred; can be a config option later)
- Replacing the web viewer or VS Code extension (TUI is a third peer, not a replacement)

## Open questions

- Does the TUI talk to a long-running `zettelgeist serve` (REST) or directly
  to the filesystem via `@zettelgeist/core`? Recommend in-process (`core`)
  for speed, with the REST option behind a `--remote URL` flag for the case
  where you're on a different machine from the repo.
- Should the TUI ship in the same npm tarball as the CLI (so `zettelgeist tui` works)?
  Or as a separate `@zettelgeist/tui` package with its own `zg-tui` binary?
  Recommend: separate package; the CLI's dependency on Ink is heavy and
  hurts cold start.
