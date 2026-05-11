# 42-everything-fixture — broad exercise of the format in one fixture

Combines features that other fixtures isolate:

- 5 specs across `phase-one` (parent), `foundation`/`platform` (children
  via `part_of`), `launch` (blocked), `research` (cancelled)
- Linear `depends_on` chain: `launch → platform → foundation`
- All seven status flavours touched: `draft`, `in-review`,
  `in-progress`, `blocked`, `cancelled` (via overrides and derivation)
- Task tags: `#skip`, `#agent-only`, `#human-only`
- Optional files exercised: `handoff.md`, `lenses/security.md`
- Numeric task prefixes (`1.`, `2.`) stripped from rendered text
- A pre-existing INDEX.md with a hand-authored preamble; regeneration
  preserves the preamble and replaces only the auto-generated region

This fixture exists to catch broad regressions: if any of the smaller
pinned-down behaviours drifts, this output diff makes that visible.
