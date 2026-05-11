# 39-bom-prefix — UTF-8 BOM at file start is tolerated

Files saved from Windows Notepad or some editors begin with the UTF-8
BOM (`EF BB BF`). gray-matter's YAML parser strips it, and the task
regex `^[\s>]*` matches the BOM because `﻿` is in `\s`. So both
frontmatter and task lines parse normally.

Status: explicit override `in-progress` from requirements.md.
Progress: 1/2 (one of two tasks checked).
