# @zettelgeist/mcp-server

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

- [#1](https://github.com/morrieinmaas/zettelgeist/pull/1) [`6adf872`](https://github.com/morrieinmaas/zettelgeist/commit/6adf872010cbe30657a9dadffa6301310826701f) Thanks [@morrieinmaas](https://github.com/morrieinmaas)! - Per-actor `.claim-<actor>` files for distributed-safe spec claiming.

  `claim_spec({name, agent_id})` now writes `specs/<name>/.claim-<sanitized-slug>` (filesystem-sanitized from `agent_id`) instead of the single-actor `specs/<name>/.claim`. Two machines claiming the same spec concurrently no longer hit a git merge conflict — they produce two distinct files. `release_spec({name, agent_id})` removes only the caller's per-actor file, leaving other actors' claims intact.

  Read-time back-compat: legacy single `.claim` files from v0.1 are still recognised — both shapes contribute to `RepoState.claimedSpecs`. `release_spec` without `agent_id` falls back to removing the legacy file.

  Side effect: CLI and MCP read paths now actually populate `RepoState.claimedSpecs` from disk via the new `scanClaimedSpecs()` helper — so claimed specs correctly derive to `in-progress`, closing a long-standing v0.2 backlog item.

  New exports from `@zettelgeist/core`: `scanClaimedSpecs`, `sanitizeAgentId`.
