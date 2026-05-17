---
status: done
priority: high
target_version: 0.2
depends_on: [per-actor-claim]
---

# Auto-resolve `specs/INDEX.md` on merge

## Problem

`INDEX.md` is fully derived from the rest of the spec tree. When two
branches both touch any spec, both regenerate `INDEX.md` independently. The
file is then almost guaranteed to conflict on merge — even though the
correct resolution is mechanical: throw away both versions and run `regen`
against the merged tree.

## Why not a custom merge driver?

We initially specified a custom merge driver. **It doesn't work for this
case.** Git invokes merge drivers per-file in tree order, BEFORE applying
clean adds from the other branch. A driver trying to "regenerate from the
merged tree" sees an incomplete tree at invocation time and emits an INDEX
missing specs that haven't yet been checked out. Verified empirically.

The right tool is a **`post-merge` hook**: it fires after the entire merge
completes (all clean adds applied, no remaining conflicts) and sees the
fully merged working tree.

## Acceptance criteria

WHEN a git merge produces a conflict in `specs/INDEX.md`,
THE SYSTEM SHALL auto-resolve it without human intervention. Mechanism:

1. `.gitattributes` declares `specs/INDEX.md merge=union` — git's built-in
   union strategy concatenates both sides with no conflict markers (the
   content is junk, but it's a clean merge).
2. A `post-merge` hook runs `zettelgeist regen` against the now-fully-
   merged working tree.
3. If `regen` produced a change, the hook commits it as a single follow-up
   commit: `[zg] regen INDEX after merge`.

WHEN `zettelgeist install-hook` runs,
THE SYSTEM SHALL install both files:

- `.gitattributes` (tracked, shared) gets a marker-wrapped block containing
  `specs/INDEX.md merge=union`.
- `.git/hooks/post-merge` (local, per-clone) gets a marker-wrapped script
  that runs regen + commit.

Both writes SHALL be idempotent (re-installing replaces the marker region).

WHEN re-installing finds a non-marker `post-merge` hook,
THE SYSTEM SHALL back up the existing hook to `post-merge.before-zettelgeist`
and replace it (same semantics as the pre-commit hook).

WHEN a prior install left `merge.zettelgeist-index.*` config entries in
`.git/config` from an earlier (now-removed) driver-based approach,
THE SYSTEM SHALL strip them so the post-merge strategy isn't shadowed.

## Non-goals

- A `zettelgeist merge-driver` CLI subcommand. Not needed for INDEX; git's
  built-in union is enough when paired with post-merge. The future
  `tasks-merge-driver` and `frontmatter-merge-driver` specs will need a
  driver (those files ARE merged semantically, not regenerated) — they
  can add the CLI subcommand at that point.
- Stale-claim handling.
- Multi-stage rebase support beyond what `post-merge` covers.
