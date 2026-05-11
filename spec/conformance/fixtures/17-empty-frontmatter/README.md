# 17-empty-frontmatter — `---\n---\n` with no keys parses to `{}`

Empty YAML between the delimiters is valid; it parses as `data: {}` and
contributes no overrides. Status derives normally.
