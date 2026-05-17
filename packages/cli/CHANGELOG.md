# @zettelgeist/cli

## 0.2.0

### Minor Changes

- [#2](https://github.com/morrieinmaas/zettelgeist/pull/2) [`1eca77c`](https://github.com/morrieinmaas/zettelgeist/commit/1eca77c5890dff8c25498bc0e2e09d5625af399b) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - Auto-resolve `specs/INDEX.md` and `specs/*/tasks.md` conflicts on merge — two agents (or a human + an agent) working on different machines no longer hit conflict markers on these files.

  ### `specs/INDEX.md` — `merge=union` + `post-merge` regen

  `install-hook` now appends `specs/INDEX.md merge=union` to `.gitattributes` (smart-merged with marker block) and installs `.git/hooks/post-merge`. Git's built-in union strategy concatenates both sides during merge (no markers, transient junk content). The `post-merge` hook fires after the whole merge completes, runs `zettelgeist regen` against the fully-merged tree, and commits the corrected INDEX as `[zg] regen INDEX after merge`.

  Originally specced as a custom git merge driver — abandoned after empirical verification that git invokes drivers per-file in tree order, BEFORE applying clean adds from the other branch. A driver trying to regenerate from the merged tree only sees a partial tree. Post-merge sees everything. See `specs/index-merge-driver/requirements.md` for the full reasoning.

  ### `specs/*/tasks.md` — semantic three-way merge

  New `mergeTasksMd(base, ours, theirs)` in `@zettelgeist/core`. Pure function: 3 strings in, merged string out plus an `ok` flag. Tasks are matched by their cleaned text (after numeric-prefix and known-tag stripping), not by 1-indexed position — robust against earlier-in-file additions. Per-task rules:

  - Either side checked → checked (commutative; ticks don't un-tick).
  - Both un-checked from a checked base → un-checked (deliberate release).
  - Tags union.
  - Renamed tasks coexist as two entries (delete-and-add semantics).
  - Prose structure (headings, blank lines, sections) preserved from `ours`.

  Driver shipped as `zettelgeist merge-driver tasks <base> <ours> <theirs>` and registered in `.git/config` by `install-hook` alongside `specs/*/tasks.md merge=zettelgeist-tasks` in `.gitattributes`. Unlike INDEX, this approach works as a real driver because tasks.md merging is self-contained — doesn't depend on other files.

  ### New exports

  - `@zettelgeist/core`: `mergeTasksMd`
  - `@zettelgeist/git-hook`: `GITATTRS_BLOCK`, `mergeGitAttributes`, `POST_MERGE_BLOCK`, `mergePostMergeContent`, `installMergeDrivers`

  ### Tests

  +23 unit tests (19 for `mergeTasksMd`, 4 for the CLI driver dispatch). 2 end-to-end git-merge tests with real concurrent branches verifying both INDEX post-merge regen and tasks.md semantic merge produce conflict-free, correct results.

- [#1](https://github.com/morrieinmaas/zettelgeist/pull/1) [`6adf872`](https://github.com/morrieinmaas/zettelgeist/commit/6adf872010cbe30657a9dadffa6301310826701f) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - Per-actor `.claim-<actor>` files for distributed-safe spec claiming.

  `claim_spec({name, agent_id})` now writes `specs/<name>/.claim-<sanitized-slug>` (filesystem-sanitized from `agent_id`) instead of the single-actor `specs/<name>/.claim`. Two machines claiming the same spec concurrently no longer hit a git merge conflict — they produce two distinct files. `release_spec({name, agent_id})` removes only the caller's per-actor file, leaving other actors' claims intact.

  Read-time back-compat: legacy single `.claim` files from v0.1 are still recognised — both shapes contribute to `RepoState.claimedSpecs`. `release_spec` without `agent_id` falls back to removing the legacy file.

  Side effect: CLI and MCP read paths now actually populate `RepoState.claimedSpecs` from disk via the new `scanClaimedSpecs()` helper — so claimed specs correctly derive to `in-progress`, closing a long-standing v0.2 backlog item.

  New exports from `@zettelgeist/core`: `scanClaimedSpecs`, `sanitizeAgentId`.
