---
status: planned
priority: high
target_version: 0.2
depends_on: [per-actor-claim]
---

# Custom git merge driver for `specs/INDEX.md`

## Problem

`INDEX.md` is fully derived from the rest of the spec tree. When two
branches both touch any spec, both regenerate `INDEX.md` independently. The
file is then almost guaranteed to conflict on merge — even though the
correct resolution is mechanical: throw away both versions, run `regen`
against the merged tree.

## Acceptance criteria

WHEN a git merge produces a conflict in `specs/INDEX.md`,
THE SYSTEM SHALL resolve it by running `zettelgeist regen` against the merged
working tree and using the resulting `INDEX.md` as the resolution. No human
intervention SHALL be required for this file.

WHEN `zettelgeist install-hook` runs,
THE SYSTEM SHALL also install the merge driver into `.git/config`:

```
[merge "zettelgeist-index"]
  driver = zettelgeist merge-driver index "%O" "%A" "%B"
  name = Zettelgeist INDEX.md regenerator
```

AND the repo's tracked `.gitattributes` SHALL contain (added or merged in):
```
specs/INDEX.md merge=zettelgeist-index
```

WHEN the driver runs but the merged tree is invalid (e.g. cycle introduced),
THE SYSTEM SHALL still produce an `INDEX.md` (deriving from the broken
state) and let `validate_repo` catch the cycle separately. Merge should not
fail just because validation does.

## Non-goals

- Avoiding INDEX regeneration during merge (no, we want it; the point is auto-resolution)
- Driver shipping a separate binary (use the existing `zettelgeist` CLI)
