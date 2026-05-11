# 12-unicode-name — pin down that non-ASCII names are silently rejected

The format restricts spec names to `[a-z0-9-]+` (see `packages/core/src/loader.ts`).
A directory named `zürich-launch` is therefore skipped silently: it does
not appear in `statuses`, does not contribute to the graph, and does not
trigger a validation error.

This fixture pins that behavior down. If we ever decide to either accept
unicode slugs OR emit a validation warning for skipped folders, this
fixture becomes the diff to update.
