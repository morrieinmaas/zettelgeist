---
depends_on: []
part_of: v0.2
---
# Viewer empty state

## Why

When a fresh repo has zero specs, the board view renders seven empty Kanban columns with no hint of what to do next. New users hit this on first run after `zettelgeist init` and bounce. The viewer should surface a clear "create your first spec" affordance instead.

## Acceptance criteria

The system, when the viewer loads:

- WHEN the `list_specs` response is an empty array
- THE SYSTEM SHALL hide the seven Kanban columns
- AND render a centred empty-state card
- AND present at least two creation paths: the `zettelgeist new` CLI invocation and the MCP `write_spec_file` tool name

The system, after a spec is added:

- WHEN a new spec appears (poll or refresh)
- THE SYSTEM SHALL transition back to the normal board view
- AND not flash the empty-state card

## Out of scope

- An in-viewer "create spec" form (a real mutation UI is a separate piece of work).
- Designing the `zettelgeist new` CLI command itself.

## References

- [packages/viewer/src/](../../packages/viewer/src/) — current board view
