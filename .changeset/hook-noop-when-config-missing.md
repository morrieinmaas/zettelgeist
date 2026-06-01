---
'@zettelgeist/cli': patch
---

Pre-commit hook now self-disables in repos that aren't zettelgeist repos. Previously, a stale install left over from a removed config (or a partial init) would block every commit with `error: not a zettelgeist repo`. The installed hook block now exits 0 silently when `.zettelgeist.yaml` is missing. Re-run `zettelgeist install-hook` (or `zettelgeist init`) to update existing hooks.
