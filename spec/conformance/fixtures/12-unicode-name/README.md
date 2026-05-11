# 12-unicode-name — non-ASCII names are silently rejected by the loader

The format restricts spec names to `[a-z0-9-]+` (see
`packages/core/src/loader.ts`). A directory named `zürich-launch` is
therefore skipped silently: it does not appear in `statuses`, does not
contribute to the graph, and — because its `requirements.md` here has
no frontmatter and at least one markdown file is present — does not
trigger any validation error either.

Note the loader/validator asymmetry: the validator does **not** apply
the regex, so a unicode-named dir with malformed YAML frontmatter
would still emit `E_INVALID_FRONTMATTER`. Fixture 15 pins that case
down with a dotfile-prefixed dir; this fixture stays on the
"everything clean" path so the difference is observable in isolation.

If we ever decide to either accept unicode slugs OR emit a validation
warning for skipped folders, this fixture becomes the diff to update.
