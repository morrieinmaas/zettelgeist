---
status: planned
priority: medium
target_version: 0.3.x
depends_on: [gcc-alignment, frontmatter-merge-driver, tasks-merge-driver]
---

# Custom git merge driver for `.log.md` (cycle-aware union)

## Problem

v0.3 shipped per-spec `.log.md` (Observation–Thought–Action trace, §9.4) as a single file appended-to by every actor. The companion `.claim-<agent>` design from v0.2 specifically avoids git conflicts on concurrent claims by giving each actor its own file. But `.log.md` is one file per spec, and two agents claiming the same spec from different machines will both append cycle markers at the end — producing a conflict on the next `git pull`/rebase.

The v0.3 reference implementation lands without a custom driver for `.log.md`, which means:

- Solo work: no conflicts (one writer at a time).
- Multi-actor on the same spec from different clones: **conflict on `.log.md` every time both push a cycle marker before pulling**.

This contradicts the v0.2 spec's "multiple actors" framing — the claim files don't conflict, but the log of who claimed/released does.

`merge=union` (used for `INDEX.md`) is wrong here: it concatenates lines naively, which would interleave cycle markers and break the structural invariant (claim/action/release order matters; cycles must not nest from interleaving).

## Acceptance criteria

WHEN a git merge produces a conflict in any `specs/*/.log.md`,
THE DRIVER SHALL split each side into the parsed cycle list (via `parseLogCycles` from `@zettelgeist/core`), merge cycle lists by:

1. **Base unchanged → take the changed side.** If `ours.cycles ⊇ base.cycles` and the new cycles are appended-only, ours wins; same for theirs.
2. **Both appended distinct cycles → union, sorted by `open.timestamp`.** Two agents recording independent claim/release pairs is the common case; concatenate then sort.
3. **Both touched the same cycle.** Rare (would mean one agent's tool fired in the middle of another agent's cycle, on the same machine — protocol violation). Treat as conflict; emit `# <<<<<<<` / `# >>>>>>>` markers around the divergent cycle so the human can resolve.
4. **Re-apply rotation.** After union, if the result exceeds `DEFAULT_MAX_CYCLES`, drop the oldest complete cycles per §9.4 (no LLM).

The driver SHALL be invoked by `.gitattributes` rule `specs/*/.log.md merge=zettelgeist-log` registered by `zettelgeist install-hook`. Exit code follows git's contract (0 = clean, non-zero = markers present).

## Non-goals

- **No LLM-driven summarisation** in the merge. Same constraint as the rest of v0.3 — deterministic only. The git history is the long-term record.
- **No reordering of preserved cycles.** Within a single side, cycle order MUST be preserved. The union sort applies only to the cross-side combination.
- **Header / stray-line preservation.** Headers from both sides are concatenated (ours first, then theirs) without dedup. Stray lines inside cycles ride with their cycle.

## Why this is a v0.3.x follow-up, not v0.3.0

The merge problem only surfaces with two-or-more actors on the same spec from different clones. The v0.3 ship date prioritised the read-side primitives (`.log.md` + `context`) over the merge-side completeness. Solo dogfooding doesn't hit this case; we can ship v0.3.0, gather usage signal, and add the driver in 0.3.1 without breaking the format.

When this lands, the `gatherContext --status` "concurrent actors" claim becomes fully accurate.

## Open question

Are abandoned cycles (claim with no release on one side, release on the other) a real case worth handling? Probably yes — if Alice claims, crashes, then Bob claims on a different clone, the merge needs to pick a sensible resolution. Proposal: keep both cycles, mark the abandoned one with a `# <!-- abandoned during merge -->` stray line so a human can clean up.
