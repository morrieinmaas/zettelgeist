# 41-blocked-by-chain — blocked status does NOT propagate through `depends_on`

`db` is `blocked`. `core` depends on `db`, `api` depends on `core`, and
`ui` depends on `api`. Per the spec, dependencies do NOT transitively
inherit blocked status. `core`, `api`, and `ui` are all `draft`.

Surfacing the transitive block is a UI concern, not a data concern —
this fixture pins that down so an "auto-propagate" change would be a
deliberate format extension.
