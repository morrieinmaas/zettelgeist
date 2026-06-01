---
'@zettelgeist/mcp-server': patch
---

`tick_task` now clears a stale `status: draft` frontmatter override on `requirements.md` as part of the same commit. This unblocks specs created from the board's "+" column button (which pins `status: draft`) from staying stuck in the draft column after every task is ticked. Other override values (`blocked`, `cancelled`, `planned`, `in-progress`, `in-review`, `done`) are left untouched — they may reflect explicit user intent. `untick_task` does not clear the override, so the draft column reset use-case still works.
