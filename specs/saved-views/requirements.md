---
depends_on: []
part_of: v0.2
---
# Saved views

## Why

`INDEX.md` shows every spec in one table. Real teams want focused views: "blockers I own", "stale specs > 30 days old", "everything in the `payments` epic", "recently merged". Today they'd build these by hand or via MCP `prepare_synthesis_context`.

Rowboat-style live queries demonstrate the value: an auto-updated saved view is a continuous knowledge surface, not a one-shot report. For Zettelgeist, saved views are configurable filters over the spec set, defined in `.zettelgeist.yaml` and rendered by the same tools that produce `INDEX.md` and the viewer.

## Acceptance criteria

The system, when reading config:

- WHEN `.zettelgeist.yaml` contains a `views:` map of named view definitions
- THE SYSTEM SHALL parse them as `{name: { filter: ..., title?: string, sort?: string }}` shape
- AND ignore unknown view-definition keys (forward compatibility)

The system, when filtering:

- WHEN a view definition declares a `filter`, supported filters in v0.2 SHALL include:
  - `status: <status>` — match a derived status
  - `part_of: <name>` — match a part_of value
  - `blocked: true` — match any spec with `frontmatter.status == "blocked"` or any spec where a `depends_on` target is blocked
  - `stale: <duration>` (e.g. "30d") — last touched commit older than the duration
- AND view filters MAY be combined via an `all: [...]` or `any: [...]` array

The system, in INDEX.md:

- WHEN saved views are defined
- THE SYSTEM SHALL render each view as a separate section in INDEX.md's auto region, with its `title` (or name) as a heading
- AND each view section MUST render as a state table identical in shape to the main `State` table

The system, in the viewer:

- WHEN saved views are defined
- THE SYSTEM SHALL surface them in the board view as column-filtering chips OR as a dedicated "Views" tab — implementation chooses

## Out of scope

- User-defined SQL-like query language. v0.2 ships fixed filter kinds (`status`, `part_of`, `blocked`, `stale`). Power users can use MCP for arbitrary queries.
- View persistence across machines beyond the committed `.zettelgeist.yaml` (no per-user state in v0.2).
- Pivot tables / charts. The view is always a state table.

## References

- [`packages/core/src/config.ts`](../../packages/core/src/config.ts) — needs `views` parsing.
- [`packages/core/src/regen.ts`](../../packages/core/src/regen.ts) — needs per-view section rendering.
- Plan 1 design's "INDEX.md" section — the existing rendering rules are the foundation; views are additive sections.
- Inspiration: rowboat-style live notes, GitHub Projects saved views, Linear queries.
