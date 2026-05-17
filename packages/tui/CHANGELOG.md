# @zettelgeist/tui

## 0.2.0

### Minor Changes

- [#4](https://github.com/morrieinmaas/zettelgeist/pull/4) [`cb5ecc7`](https://github.com/morrieinmaas/zettelgeist/commit/cb5ecc7e066a17cbe87b8d7ab55e5f6eb93e43a1) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - Finishes the v0.2 distributed-conflict roadmap with three new features.

  ### Frontmatter merge driver (`specs/*/requirements.md` YAML block)

  New `mergeFrontmatter(base, ours, theirs)` in `@zettelgeist/core`. Pure function; per-field rules:

  - `status` (the 7 valid values): 3-way merge — both same → that, one side unchanged from base → take the other, both changed differently → conflict marker (emitted as YAML comments so the file stays parseable).
  - `depends_on` / `replaces` (lists): set union with first-occurrence order preservation; non-string entries are kept rather than silently dropped (data preservation over schema enforcement).
  - `blocked_by` / `part_of` / `merged_into` (scalars): 3-way — both same → that; one side unchanged from base → take the other (including an explicit clear, so unblocking a spec actually works); divergent change → conflict marker. Non-string values are preserved instead of coerced to empty.
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
