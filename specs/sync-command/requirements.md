---
status: planned
priority: medium
target_version: 0.2
depends_on: [index-merge-driver, tasks-merge-driver, frontmatter-merge-driver]
---

# `zettelgeist sync` command

## Problem

When working across machines, the only safe rhythm today is the user
manually doing `git fetch && git rebase && pnpm regen`. Easy to forget; easy
to do in the wrong order; easy to land in a partial-resolution mess.

## Acceptance criteria

WHEN an agent or human runs `zettelgeist sync`,
THE SYSTEM SHALL:
  1. `git fetch` the upstream of the current branch
  2. If local is up-to-date: report "already up to date" and exit 0
  3. If local is behind only: fast-forward
  4. If diverged: rebase local onto upstream, using the registered Zettelgeist
     merge drivers (INDEX, tasks, frontmatter) to auto-resolve format-managed conflicts
  5. Regenerate INDEX.md if not already current
  6. Report what changed (count of specs touched, count of auto-resolved conflicts)

WHEN sync hits a conflict the drivers cannot resolve (e.g. divergent body
edits to `requirements.md`),
THE SYSTEM SHALL stop with a clear message, exit non-zero, and leave the
working tree in the git-standard conflict state so the user can resolve with
their editor.

WHEN `zettelgeist sync --check` is invoked,
THE SYSTEM SHALL only inspect drift state and exit non-zero if a sync is
needed, without mutating anything. Use in CI / pre-action hooks.

## Non-goals

- Auto-push (this is local-side only; pushing is still explicit)
- Working across multiple remotes (just current branch upstream)
- Reflog manipulation / squashing of micro-commits
