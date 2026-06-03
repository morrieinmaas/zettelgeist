---
'@zettelgeist/cli': patch
---

Pre-commit hook now also self-disables on branches where `specs/INDEX.md` is not part of the branch's git history. Before this, a back-in-time checkout (or a fresh `zettelgeist init` before the first `regen`) blocked every commit with `error: specs/INDEX.md is missing` because the hook's `regen --check` had nothing to compare against. The hook now performs a `git ls-files --error-unmatch specs/INDEX.md` pre-flight: if the index file isn't tracked on this branch, there's nothing to be stale about and the hook exits 0. Re-run `zettelgeist install-hook` to update existing hooks. The full pre-commit flow now also has end-to-end test coverage in `@zettelgeist/git-hook`'s test suite, regression-guarding both this bug and the earlier non-zg-repo bug.
