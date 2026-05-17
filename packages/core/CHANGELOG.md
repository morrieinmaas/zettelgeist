# @zettelgeist/core

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

- [#4](https://github.com/morrieinmaas/zettelgeist/pull/4) [`cb5ecc7`](https://github.com/morrieinmaas/zettelgeist/commit/cb5ecc7e066a17cbe87b8d7ab55e5f6eb93e43a1) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - Finishes the v0.2 distributed-conflict roadmap with three new features.

  ### Frontmatter merge driver (`specs/*/requirements.md` YAML block)

  New `mergeFrontmatter(base, ours, theirs)` in `@zettelgeist/core`. Pure function; per-field rules:

  - `status` (the 7 valid values): 3-way merge — both same → that, one side unchanged from base → take the other, both changed differently → conflict marker (emitted as YAML comments so the file stays parseable).
  - `depends_on` / `replaces` (lists): set union with first-occurrence order preservation; non-string entries are kept rather than silently dropped (data preservation over schema enforcement).
  - `blocked_by` / `part_of` / `merged_into` (scalars): 3-way; missing/empty wins-over-non-empty; divergent change → conflict marker. Non-string values are preserved instead of coerced to empty.
  - `auto_merge` (boolean): 3-way (NOT raw OR) — so a side wanting to turn off `auto_merge` actually can, even when the other side hasn't touched it.
  - Unknown keys: opaque 3-way with structural equality; nested objects compared via `deepEqual` and round-tripped via `js-yaml` flow style.

  The body below the closing `---` is merged via `git merge-file -p` for proper line-level three-way merge — so disjoint prose edits compose cleanly. When the body has unresolvable overlap, standard `<<<<<<<` markers are emitted and the driver exits non-zero so git records the file as conflicted.

  Wired through `zettelgeist merge-driver frontmatter` and registered by `install-hook` as `specs/*/requirements.md merge=zettelgeist-frontmatter`.

  ### `zettelgeist sync` command

  Wraps `git fetch && git rebase` with the merge drivers (INDEX post-merge regen, tasks driver, frontmatter driver) handling format-managed files automatically. Statuses: `up-to-date`, `fast-forwarded`, `rebased`, `needs-sync`, `no-upstream`, `not-a-repo`, `detached-head`.

  - `--check` mode is truly read-only — uses `git ls-remote` to inspect upstream without updating local remote-tracking refs (safe for CI gating).
  - `--allow-dirty` skips the clean-tree check; `rebase.autoStash` is auto-detected and honored.
  - Refuses to run if the Zettelgeist merge drivers aren't installed (run `zettelgeist install-hook` first) — prevents silently using git's default merge on managed files.
  - When rebase produces an unresolved conflict, sync stops and LEAVES the rebase active (`git rebase --continue` or `--abort`).
  - INDEX regen after a successful sync is committed as `[zg] regen INDEX after sync`; commit failures are surfaced via `indexCommitFailed` in the envelope rather than silently swallowed.

  ### `@zettelgeist/tui` package — terminal UI

  New package, new `zg-tui` binary. Built with Ink + React. Four views (board, detail, graph, docs) + a command palette (`?`). In-process backend reads via `@zettelgeist/core` — no separate server needed. Vim-style hjkl + arrow nav; 1/2/3/4 jump between views; tab cycles. ASCII dependency graph with cycle highlighting. Empty-state hints everywhere.

  Read-only for now: mutations still flow through the CLI / MCP / web viewer. Write support is on the v0.2.x list (so the merge-driver work has time to bake before another set of writers hits it).
