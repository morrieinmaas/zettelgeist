---
status: planned
priority: medium
target_version: 0.2
---

# Custom git merge driver for YAML frontmatter blocks in `requirements.md`

## Problem

The YAML block at the top of `requirements.md` carries spec metadata
(status, depends_on, blocked_by, part_of, custom fields). When two branches
both touch the metadata — even for non-overlapping fields — git's line-based
merge often conflicts because the YAML block is a contiguous region of
short lines.

## Acceptance criteria

WHEN a git merge produces a conflict in any `specs/*/requirements.md`,
THE DRIVER SHALL split each side into (frontmatter YAML, body), merge the
two halves separately:

1. **Frontmatter**: parse both sides into objects; merge field by field:
   - `status` (one of the 7 values): if both sides set the same → that value;
     if different → conflict marker for `status` field only (with both values surfaced)
   - `depends_on` / `replaces` (list of strings): set union, deterministic order
   - `blocked_by` (string): if both empty or both equal → that; if one empty → the non-empty;
     if both non-empty and different → conflict
   - `part_of`, `merged_into` (string): same single-value rule as `blocked_by`
   - `auto_merge` (boolean): logical OR
   - Unknown keys: if only one side set → that side's value; if both set and equal → that value;
     if both set and differ → conflict for that key
2. **Body** (everything after the closing `---`): standard git text-merge

Result is emitted as a normal `requirements.md` (YAML block, `---`, body). If
any field needed a conflict marker, emit a YAML-comment with `# <<<<<<< OURS`
style markers around the field so the file is still parseable enough for a
human to see the issue in their editor.

The driver lives at `zettelgeist merge-driver frontmatter <base> <ours> <theirs>`.

## Non-goals

- Schema validation during merge (validate_repo runs separately)
- Merging custom-keyed nested objects (treat unknown keys as opaque per the rule above)
