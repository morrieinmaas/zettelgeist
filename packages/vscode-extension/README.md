# Zettelgeist for VSCode

Open the Zettelgeist Kanban board, dependency graph, and editable spec detail view inside a VSCode panel. Every "click" is still a markdown edit and a git commit — the extension hosts the same viewer the standalone `zettelgeist serve` does, just with VSCode as the surface.

## Features

- **Kanban board with drag-to-any-column writeback** — drop a card on any status; the spec's frontmatter `status:` field is updated and committed.
- **Editable spec detail view** — requirements, handoff, and lens bodies edit inline; tasks support add / edit / delete.
- **Per-card edit modal** — set status override, blocked reason, PR URL, branch, worktree path.
- **Dependency graph** — Mermaid rendering of `depends_on` edges; click a node to jump to the spec.
- **Validation banner** — surfaces `validate_repo` errors at the top of the board.
- **Theme follows VSCode** — automatically picks light or dark to match your editor.

## Commands

| Command palette | What it does |
| --- | --- |
| `Zettelgeist: Open Board` | Open the Kanban board in a side panel. |
| `Zettelgeist: Open in Browser` | Spawn `zettelgeist serve` and open the viewer in your system browser (uses `zettelgeist.serverPort`). |
| `Zettelgeist: Regenerate INDEX.md` | Rebuild `specs/INDEX.md` from the current spec set. |
| `Zettelgeist: Install Pre-commit Hook` | Install the pre-commit hook that keeps `INDEX.md` current. |

The extension activates automatically when a workspace contains a `.zettelgeist.yaml` file.

## How it works

The extension hosts the `@zettelgeist/viewer` bundle in a VSCode webview. A
postMessage shim injected into the webview translates the
`window.zettelgeistBackend` calls into messages the extension host
answers using:

- `@zettelgeist/core` for parse / derive / validate / regen.
- `@zettelgeist/fs-adapters` for disk reads.
- `gray-matter` + `js-yaml` for frontmatter merges.
- `git` (via `execFile`) for the commit step after each mutation.

Every mutation produces one commit, exactly like `zettelgeist serve`.
There is no in-extension state — close the panel, reopen it, everything
loads from disk.

## Configuration

All settings live under the `zettelgeist.*` namespace. Open the VSCode Settings UI and filter by "zettelgeist", or edit `settings.json` directly.

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `zettelgeist.theme` | `auto`, `light`, or `dark` | `auto` | Viewer theme. `auto` follows the VSCode color theme. |
| `zettelgeist.defaultView` | `board`, `graph`, or `docs` | `board` | Which view the panel lands on when opened. |
| `zettelgeist.autoOpenBoard` | boolean | `false` | Automatically open the board when a workspace containing `.zettelgeist.yaml` is loaded. |
| `zettelgeist.serverPort` | number | `7681` | Port used by **Zettelgeist: Open in Browser** when spawning `zettelgeist serve`. Change if 7681 conflicts with another local service. |
| `zettelgeist.serverHost` | string | `127.0.0.1` | Host the external-browser server binds to. Defaults to localhost-only; set to `0.0.0.0` to share over the LAN. |

The extension's own panel (the webview) doesn't use a port — it loads the viewer bundle directly through VSCode's `vscode-webview://` scheme. The port settings only apply to **Open in Browser**, which spawns the standalone `zettelgeist serve` and opens the URL in your system browser (handy for screen-sharing, dual-monitor setups, or showing a non-VSCode reviewer).

## Requirements

- A workspace folder containing a `.zettelgeist.yaml` file.
- `git` available on PATH (the extension shells out for the commit step).

## Development

```bash
pnpm install
pnpm --filter @zettelgeist/viewer build
pnpm --filter @zettelgeist/vscode-extension build
```

In VSCode: open `packages/vscode-extension`, press F5 to launch a development host with the extension loaded.

## License

Apache-2.0. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
