# @zettelgeist/tui

Terminal-native UI for the [Zettelgeist v0.1 format](../../spec/zettelgeist-v0.1.md). Built with [Ink](https://github.com/vadimdemedes/ink) + React. Runs in-process — no separate server.

## Install

```bash
npm i -g @zettelgeist/tui
```

Or alongside the CLI in a project:

```bash
pnpm add -D @zettelgeist/cli @zettelgeist/tui
```

Then run `zg-tui` inside any directory containing `.zettelgeist.yaml`. If `@zettelgeist/cli` is installed too, you can also launch via `zettelgeist tui` (a thin shim).

## Views

- **Board** (`1`) — kanban-style columns, one per status (draft / planned / in-progress / in-review / done / blocked / cancelled). Cards = specs. Specs with a status not in the canonical enum bucket into a `misc` column rather than crashing.
- **Detail** (`2`) — open spec with tabs for requirements / tasks / handoff / lenses. Picker shows when no spec is selected.
- **Graph** (`3`) — ASCII layered dependency graph, deepest dependencies at the bottom, edges + cycles listed below.
- **Docs** (`4`) — browse `docs/` markdown files.
- **Command palette** (`?`) — fuzzy-search every view-change command.

## Keys

| Key | Action |
| --- | --- |
| `↑↓ ←→` / `hjkl` | navigate |
| `enter` | open / select |
| `1` `2` `3` `4` | jump to board / detail / graph / docs |
| `tab` | cycle views |
| `?` | command palette |
| `esc` | close palette / close open doc |
| `q` / Ctrl-C | quit |

## Read-only at v0.2

The TUI reads via `@zettelgeist/core` directly — there's no separate backend. Mutations still flow through the CLI (`zettelgeist`), the web viewer (`zettelgeist serve`), or the MCP server. Write support is on the v0.2.x roadmap.

## Flags

```
zg-tui [--view=board|detail|graph|docs]
zg-tui --help
zg-tui --version
```
