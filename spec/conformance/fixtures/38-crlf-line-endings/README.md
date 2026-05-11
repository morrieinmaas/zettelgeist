# 38-crlf-line-endings — CRLF tasks.md silently produces zero tasks

When `tasks.md` uses Windows CRLF line endings, the trailing `\r` is left
on each line after `body.split('\n')`. The task regex anchors with `$`
(end of string) and `.` does not match `\r`, so no line matches.

This is a real quirk for round-tripping Windows-authored files. Pinning
it down here forces a deliberate decision if a future implementer adds
CRLF tolerance (which would change derived status — a breaking format
change unless minor).

The frontmatter parser (gray-matter) DOES handle CRLF, so the explicit
`status: planned` from requirements.md still applies. With 0 counted
tasks and the override, the result is `planned`.
