# 24-task-checked-variants — `[ ]`, `[x]`, `[X]` parse; `[]` and `[  ]` don't

The regex requires exactly one character (space, x, or X) inside the
brackets. Both lowercase and uppercase X mark the task as checked.
Variants with no character or multiple characters are NOT tasks and do
not contribute to progress counts.
