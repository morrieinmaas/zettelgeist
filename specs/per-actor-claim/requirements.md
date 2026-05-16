---
status: in-progress
priority: high
target_version: 0.2
---

# Per-actor `.claim` files

## Problem

Today `claim_spec` writes a single file at `specs/<name>/.claim`. When two
machines (or two agents) claim the same spec, both write the same path and
git rejects the second push with a non-fast-forward error. After pull/rebase,
the `.claim` file is in conflict — even though the two claims should coexist
harmoniously (claims are advisory locks, not exclusive ones).

## Acceptance criteria

WHEN an agent calls `claim_spec({name, agent_id})`,
THE SYSTEM SHALL write `specs/<name>/.claim-<agent_id>` (one file per actor)
INSTEAD OF the single `specs/<name>/.claim` path.

WHEN two agents claim the same spec from two machines concurrently,
THEY SHALL produce two distinct files that git merges trivially with no
conflict.

WHEN any non-stale `.claim-*` file exists in the spec directory,
THE SPEC SHALL be reported as "claimed" by `list_specs` / `read_spec` etc.
The claim-derived `in-progress` status (from `deriveStatus`) SHALL fire if
the loader sees any such file.

WHEN `release_spec({name, agent_id})` is called,
THE SYSTEM SHALL remove only that actor's `.claim-<agent_id>` file, leaving
other actors' claims intact.

WHEN `agent_id` is not provided to `claim_spec`,
THE SYSTEM SHALL synthesize one from `${process.env.USER || 'agent'}-${pid}`
or a similar deterministic-but-actor-scoped value. Document the rule.

## Format-version implication

This is a v0.1 → v0.2 minor bump. The old single-file `.claim` is still
recognised on read (back-compat), but `claim_spec` writes the new shape.

## Conformance

Add at least one fixture under `spec/conformance/fixtures/` that pins down:
- One spec with `.claim-alice` AND `.claim-bob` → loaded successfully, status derived as `in-progress`, no validation error
- One spec with the legacy single `.claim` → still recognised

## Non-goals

- Distributed locking (this remains advisory).
- TTL or stale-claim detection (deferred to v0.3 if it ever becomes a problem).
- Showing per-actor claim badges in the UI (separate spec).
