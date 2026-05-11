# 27-task-in-codeblock — fenced code blocks do NOT shield task lines

The current task parser matches lines purely by regex with no awareness
of CommonMark code fences. A `- [ ]` line inside a ```` ``` ```` block is
still counted as a task.

This is a known quirk. Pinning it down with a fixture forces a deliberate
decision if a future implementer decides to teach the parser about fences
(which would be a breaking format change requiring a version bump).

Expected: 4 tasks, 2 checked → `in-progress`, 2/4.
