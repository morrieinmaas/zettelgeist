---
"@zettelgeist/git-hook": minor
"@zettelgeist/cli": patch
---

Auto-resolve `specs/INDEX.md` conflicts on merge.

`zettelgeist install-hook` now installs two extra pieces alongside the pre-commit hook:

1. `specs/INDEX.md merge=union` is appended (or smart-merged) into `.gitattributes`. Git's built-in union strategy concatenates both sides during merge — no conflict markers, just transient junk content.
2. `.git/hooks/post-merge` runs after every successful merge (including `git pull`), executes `zettelgeist regen` against the fully-merged tree, and commits any change as `[zg] regen INDEX after merge`.

Originally specced as a custom git merge driver. That approach was abandoned because git invokes drivers per-file in tree order, BEFORE applying clean adds from the other branch — a driver trying to "regenerate from the merged tree" only sees a partial tree at invocation time and emits an INDEX missing whatever specs git hadn't yet checked out. Post-merge fires after the entire merge completes, sees everything, and produces the correct INDEX.

The install also strips any stale `merge.zettelgeist-index.*` config from the earlier driver-based attempt so it doesn't shadow the new strategy.

New exports from `@zettelgeist/git-hook`: `GITATTRS_BLOCK`, `mergeGitAttributes`, `POST_MERGE_BLOCK`, `mergePostMergeContent`, `installMergeDrivers`.
