# 30-handoff-only — a spec dir with only `handoff.md` is valid

requirements.md, tasks.md, and lenses/ are all optional. As long as the
directory contains any `.md` file (so it isn't `E_EMPTY_SPEC`), the spec
loads. With no frontmatter and no counted tasks, status is `draft`.
