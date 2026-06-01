# @zettelgeist/cli

## 0.4.1

### Patch Changes

- [#15](https://github.com/morrieinmaas/zettelgeist/pull/15) [`8853133`](https://github.com/morrieinmaas/zettelgeist/commit/885313385695e90d0b0845e8a811a5096fe433a1) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - Pre-commit hook now self-disables in repos that aren't zettelgeist repos. Previously, a stale install left over from a removed config (or a partial init) would block every commit with `error: not a zettelgeist repo`. The installed hook block now exits 0 silently when `.zettelgeist.yaml` is missing. Re-run `zettelgeist install-hook` (or `zettelgeist init`) to update existing hooks.

## 0.4.0

### Minor Changes

- [#10](https://github.com/morrieinmaas/zettelgeist/pull/10) [`a410026`](https://github.com/morrieinmaas/zettelgeist/commit/a410026f552c1bd701760886124364a8e5cbe1d4) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - ### `@zettelgeist/core` — shared init defaults

  New module `init-defaults` exports the canonical content for `zettelgeist init` so the CLI and the VS Code extension produce byte-identical output. Public API:

  - `DEFAULT_CONFIG` — the `.zettelgeist.yaml` template (`format_version: "0.1"`)
  - `DEFAULT_GITIGNORE_BLOCK` — the marker-delimited gitignore block (claim files + tool-managed state)
  - `GITIGNORE_MARKER_BEGIN` / `GITIGNORE_MARKER_END` — the marker pair for idempotent detection
  - `INIT_DIRS` — canonical three-dir layout (`specs`, `docs`, `.zettelgeist`)
  - `gitignoreWithMarkerBlock(existing)` — pure function; returns the new content or `null` if marker already present

  ### `zettelgeist init` CLI command

  New first-time onboarding command. Creates the v0.3 baseline layout in one shot:

  - `.zettelgeist.yaml` (opt-in marker with `format_version: "0.1"`)
  - `specs/` (empty — your first spec lands here)
  - `docs/` (optional non-spec markdown)
  - `.zettelgeist/` (tool-managed state — regen cache, exports)
  - `.gitignore` marker block (gitignores claim files + tool-managed state)

  Idempotent on the directory layout — re-running won't clobber pre-existing specs or duplicate the gitignore block. Requires `--force` to overwrite an existing `.zettelgeist.yaml` (so you don't lose a custom `specs_dir:` override by accident).

  Also surfaces a friendly init UX in the VS Code extension (0.3.1, shipped separately via the marketplace flow): clicking the Zettelgeist Activity Bar icon in a non-Zettelgeist workspace now shows an "Initialize Zettelgeist…" prompt instead of leaking `Failed to list docs: ENOENT`. Same prompt fires before opening the board.

## 0.3.0

### Minor Changes

- [#7](https://github.com/morrieinmaas/zettelgeist/pull/7) [`65e8040`](https://github.com/morrieinmaas/zettelgeist/commit/65e804047304ba66502cc2c3df0c4318a29ac0c0) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - v0.3: per-spec `.log.md` Observation–Thought–Action trace + windowed `zettelgeist context` retrieval. Implements the highest-leverage feature combination from [Git-Context-Controller (Wu et al., 2026, arXiv:2508.00031)](https://arxiv.org/abs/2508.00031), adapted to Zettelgeist's git-shaped workflow. Fully deterministic — no LLM calls on the MCP write path; the git history is the long-term record.

  ### `.log.md` per spec

  Every MCP write tool (`claim_spec`, `release_spec`, `tick_task`, `untick_task`, `write_handoff`, `write_spec_file`, `patch_frontmatter`, `set_status`) auto-appends a one-line entry to `specs/<name>/.log.md` in the same commit as the action itself. Two structural markers delimit cycles:

  ```
  ## ⊢ <timestamp> · agent=<id> · claim
  - <timestamp> · agent=<id> · tick_task(2)
  - <timestamp> · agent=<id> · write_handoff()
  ## ⊣ <timestamp> · agent=<id> · release · sha=abc1234
  ```

  A _cycle_ is one claim → release pair; the release marker carries the sha of the last work commit. Cycles are the unit of retrieval and rotation. Dotfile-prefixed (editors fold it), walker-ignored (no contribution to status / graph / validation / INDEX).

  Rotation is deterministic — cap at 50 complete cycles per spec; older cycles drop whole. No LLM-fold, no summarisation. The git history of `.log.md` is the long-term record; `git log specs/<name>/.log.md` recovers any rotated cycle.

  ### `zettelgeist context` CLI + MCP tool

  Windowed retrieval over the structured memory, replacing whole-file reads when an agent only needs a slice:

  - `zettelgeist context` — project status: INDEX state, currently-claimed specs (with agents), last 3 cycle releases across the repo.
  - `zettelgeist context --spec <name>` — that spec's frontmatter + handoff.md + most recent cycle (K=1, the GCC default).
  - `zettelgeist context --log <name> [--offset N]` — scroll the cycle history. Offset 0 = most recent (open cycle preferred over closed); higher = older. Exits non-zero with a `git log` hint when offset exceeds available cycles.
  - `zettelgeist context --metadata <name> [<key>]` — targeted frontmatter retrieval; one key or the full block.

  Mirrored as MCP `context` tool with input `{mode, spec?, offset?, key?}`. JSON envelope output via `--json` for programmatic consumers; plain-text human rendering otherwise.

  ### Core API additions

  - `gatherContext(reader, args)` — pure data-layer function consumed by both CLI and MCP.
  - `parseLogCycles`, `serializeLog`, `rotateLog`, `appendClaim`, `appendAction`, `appendRelease`, `DEFAULT_MAX_CYCLES = 50` — log parsing + manipulation primitives. All pure, all tested.
  - Types: `ContextResult`, `CycleSummary`, `LogCycle`, `LogActionEntry`, `LogStrayEntry`, `CycleOpenMarker`, `CycleCloseMarker`, `ParsedLog`.

  ### Spec amendment

  Format spec gains §9.4 documenting `.log.md` (file shape, cycle markers, rotation rule, walker-ignored guarantee). Plus conformance fixture `45-log-md-ignored` proving a spec with `.log.md` derives identically to a spec without one. v0.2 readers ignore the file naturally (dotfile, not in the §4 recognised-files list) — no back-compat layer required.

  ### MCP

  `@zettelgeist/mcp-server` exposes 17 tools (was 16; +`context`). Existing tool signatures are unchanged.

  ### Why no SWE-Bench eval

  We considered gating v0.3 on a SWE-Bench-Verified harness (the GCC paper's primary evidence). SWE-Bench tests single-shot single-issue ~1-hour bug-fixing — the opposite of Zettelgeist's multi-session, multi-agent, multi-day value prop. Dogfooding v0.3 on Zettelgeist's own development is the validation signal.

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
