# 16-no-frontmatter — requirements.md without a YAML block parses cleanly

Files with no `---\n...\n---` header parse as `data: {}` and the full text
as body. No error, status falls back to derived (`draft`, since there are
no tasks and no claim).
