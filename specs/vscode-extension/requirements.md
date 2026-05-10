---
depends_on: []
part_of: v0.2
---
# VSCode extension

## Why

Plan 3 sketched a VSCode extension that reuses `@zettelgeist/viewer` inside a webview. The viewer is already backend-agnostic — it talks to its host via `postMessage`. Wiring up a thin VSCode backend (workspace fs + git API) gives the same Kanban / graph / dependency view as the CLI's `serve` command, directly inside the editor, with the editor's native git auth and identity.

## Acceptance criteria

The system, when the extension activates:

- WHEN the user opens a workspace containing `.zettelgeist.yaml`
- THE SYSTEM SHALL register a `Zettelgeist: Open Board` command
- AND open a webview panel that loads the shared viewer bundle

The system, when the viewer requests data:

- WHEN the viewer sends a `list_specs` / `read_spec` / `list_dependencies` message
- THE SYSTEM SHALL service the request from `vscode.workspace.fs`
- AND return the same payload shape the HTTP serve backend returns

The system, when the viewer requests a mutation:

- WHEN the viewer sends a `write_spec_file` / `set_status` message
- THE SYSTEM SHALL write the file via `vscode.workspace.fs`
- AND stage and commit via the VSCode git API with a deterministic message
- AND push back the new state to the viewer

## Out of scope

- A standalone hosted viewer (separate spec).
- Layer 3 template overrides for the viewer (separate spec).
- Marketplace publishing automation beyond a one-shot `vsce publish` documented in the README.

## References

- [packages/viewer/](../../packages/viewer/) — bundle we reuse
- [docs/design.md](../../docs/design.md) — §"viewer backends" sketches the postMessage protocol
