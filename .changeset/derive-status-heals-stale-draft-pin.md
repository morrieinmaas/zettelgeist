---
'@zettelgeist/core': patch
---

`deriveStatus` now ignores a `status: draft` frontmatter override when the spec has at least one counted task and every counted task is checked. The override is provably stale in that case (the board's "+" button writes it on new-card creation and nothing clears it afterwards). The card transparently moves to `in-review` (or `done` if merged) on the next render — no file mutation, no user action. Other override values (`planned`, `in-progress`, `in-review`, `done`, `blocked`, `cancelled`) and `draft` overrides with partial or zero progress are unchanged.
