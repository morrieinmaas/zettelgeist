---
depends_on: []
part_of: v0.2
status: cancelled
blocked_by: >-
  Cancelled in favor of the agent-first thesis. The premise of saved views
  was that users want to maintain a library of named filters over the spec
  set. In a workflow where every user has an LLM agent in hand and MCP
  exposes `prepare_synthesis_context`, "show me blocked specs in payments"
  is one prompt — there's no value in persisting that as a configuration
  artifact. `part_of` already exists for declaring "this group of specs is
  meaningful," and git history is queryable by the agent directly.
  Keeping this doc as a record of the decision; not scheduled for any
  release.
---
# Saved views (CANCELLED)

## Why this got dropped

`INDEX.md` shows every spec in one table. The original idea was: real
teams want focused views ("blockers I own", "stale > 30 days",
"everything in the `payments` epic"), so let `.zettelgeist.yaml` declare
named filters that the tools render into `INDEX.md` sections + viewer
chips.

After shipping the rest of v0.2, the design pressure shifted: this
project's thesis is agents and humans as equals, with MCP giving agents
a tool surface that's strictly more powerful than any pre-canned filter
UI. The agent already has `list_specs`, `read_spec`, `prepare_synthesis_context`.
A user with an agent in hand asks "show me blocked specs in payments"
and gets the answer — no configuration to maintain, no schema to extend,
no UI surface to design. The remaining audience for saved views would
be users without an agent, but that's not the user we're optimizing for.

`part_of` already exists for the legitimate underlying need (declaring
"this group of specs belongs together"). Saved views would have been
*persisted filter expressions* on top — which is pure UI sugar, not a
new abstraction.

Keeping this directory as a record of the decision. If the call ever
gets reversed, the original requirements + tasks are below for
reference.

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
