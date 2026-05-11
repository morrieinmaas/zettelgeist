# 37-missing-format-version — absent `format_version` is an E_INVALID_FRONTMATTER

`.zettelgeist.yaml` MUST declare a string `format_version`. Without it,
the loader emits one E_INVALID_FRONTMATTER but otherwise continues
processing with default settings.
