---
status: planned
priority: medium
target_version: 0.2
---

# Custom git merge driver for `specs/<name>/tasks.md`

## Problem

When two branches both tick checkboxes in `tasks.md`, git's line-based
merge frequently produces conflict markers — including the surprising case
where both branches tick the *same* task and want the same outcome but git
sees "two divergent edits to one line".

## Acceptance criteria

WHEN a git merge produces a conflict in any `specs/*/tasks.md`,
THE SYSTEM SHALL parse both sides via `parseTasks`, merge semantically by
task index, and emit a single reconciled `tasks.md`. Rules:

- Both sides checked the same index → checked
- Either side checked → checked (commutative; ticks don't un-tick)
- Both sides explicitly un-ticked from checked → un-ticked
- Different index sets → union, preserving original order from `<ours>` then
  appending new ones from `<theirs>` after them
- Text content differs on the same index → emit a conflict marker for that
  task only (rare; human resolves), but the rest of the file is still merged
- Tag set differs on the same index → union of tags

WHEN both sides modify lines that are not task lines (prose between tasks),
THE DRIVER SHALL run a standard text-merge on those segments and only do
the task-aware logic on lines matching the task regex.

The driver lives at `zettelgeist merge-driver tasks <base> <ours> <theirs>`.

## Non-goals

- Reordering tasks (positional order is preserved as authored)
- Smart text-merging task descriptions (too risky; conflict marker is the safe answer)
- Skip-tag arbitration when one side adds #skip and the other doesn't (union per rule above; that's correct)
