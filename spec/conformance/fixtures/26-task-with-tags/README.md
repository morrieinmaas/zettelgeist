# 26-task-with-tags — `#human-only`, `#agent-only`, `#skip` are recognised tags

Known tags are stripped from task text and stored separately. `#skip`
removes the task from the counted set (so progress and derived status
ignore it). Unknown `#words` remain in the text. Multiple known tags on
one line are all recognised in order of appearance.

Here, 3 counted tasks (1, 2, 5); tasks 3 and 4 carry `#skip`. None
checked → `planned`. Progress 0/3.
