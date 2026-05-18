---
status: planned
priority: high
target_version: 0.3
depends_on: [sync-command, frontmatter-merge-driver, per-actor-claim]
---

# GCC-style context retrieval + per-spec OTA log

## Problem

Zettelgeist's current memory model gives an agent two surfaces per spec:
`requirements.md` (intent + frontmatter) and `handoff.md` (one-shot
free-form note). That works for solo work but breaks at scale:

1. **No fine-grained execution trace.** When a session ends mid-task, the
   next agent sees a stale `handoff.md` and the current state of
   `tasks.md` — but nothing about *what was tried, what was observed, what
   was decided* between those checkpoints. Either you re-derive the
   reasoning from scratch or you pollute `handoff.md` with stream-of-
   consciousness notes.
2. **No windowed retrieval.** `read_spec` returns the whole spec folder.
   For specs with months of history (and `handoff.md` accumulating
   sediment), agents either burn context on irrelevant detail or skip
   reading and miss something load-bearing.
3. **No "where was I" affordance for resuming agents.** A new session
   starts cold and has to be re-briefed by the human user. The structured
   data (`status`, tasks checked/unchecked, claimed-by) is recoverable; the
   *narrative continuity* is not.

The [GCC paper (Wu et al., 2026, arXiv:2508.00031)][gcc] validates
empirically (SOTA on SWE-Bench Verified, +13.6% over Claude 4 Sonnet
baseline) that agents equipped with **a fine-grained execution log +
windowed retrieval over it** outperform every long-context, summary, and
folding alternative they tested. The ablation in their Table 3 attributes
+6.2pp of the total gain to that pairing alone — the largest single delta
of any feature combination.

We adopt the pairing in a Zettelgeist-native shape, with two hard
constraints from the design discussion:

- **No LLM calls on the MCP write path.** Append, rotate, retrieve are
  all deterministic. Summarization-on-release was considered and rejected
  (introduces variance, latency, and per-action billing).
- **No new branching model.** GCC's BRANCH/MERGE as reasoning
  trajectories conflicts with git branches. The +2.4pp ablation gain
  doesn't justify a parallel mental model.

[gcc]: https://arxiv.org/abs/2508.00031

## Acceptance criteria

### `.log.md` — per-spec Observation–Thought–Action trace

WHEN any MCP write tool fires against `specs/<name>/` (`claim_spec`,
`release_spec`, `tick_task`, `untick_task`, `write_handoff`, `write_requirements`,
`add_task`, `set_status`),
THE MCP SERVER SHALL append a structured entry to `specs/<name>/.log.md`
in the form:

```
- <ISO-8601-timestamp> · agent=<agent_id> · <action>(<args>)
```

where `args` is a deterministic short rendering (e.g. `tick_task(2)` or
`set_status(blocked → planned)`). One line per action. No prose, no LLM.

WHEN `claim_spec` fires, an opening cycle marker SHALL be written:

```
## ⊢ <ISO-timestamp> · agent=<agent_id> · claim
```

WHEN `release_spec` fires, a closing cycle marker SHALL be written:

```
## ⊣ <ISO-timestamp> · agent=<agent_id> · release · sha=<git-sha>
```

where `git-sha` is the SHA of the commit produced by `release_spec` (the
SHA is what gives cycles a join key against `git log` — see CONTEXT
retrieval below).

The file SHALL be UTF-8, dotfile-prefixed (`.log.md`), and committed
alongside the spec by the MCP write tools (same tmp+rename + commit
pattern used for `tasks.md` etc.).

THE FILE WALKER (loader, validator, regen) SHALL ignore `.log.md`. It does
not contribute to status derivation, the graph, or `INDEX.md`. It is
metadata about *how* the spec evolved, not state.

### Deterministic rotation

WHEN appending to `.log.md` would push the file's complete-cycle count
above **50**,
THE MCP SERVER SHALL drop the oldest complete cycle (one `## ⊢ ...` block
through its matching `## ⊣ ...` block) before appending the new entry.

A "complete cycle" requires both an opening and a closing marker. An
in-progress cycle (claim with no release yet) is never rotated.

The git history is the long-term record: agents who need older context
can `git log specs/<name>/.log.md` to recover rolled-off cycles.

### `zettelgeist context [...]` — windowed retrieval

WHEN `zettelgeist context` is invoked with no arguments,
THE SYSTEM SHALL emit a project-status envelope containing:
  - The auto-region of `INDEX.md` (state table)
  - The set of currently-claimed specs (with claimant + claim timestamp)
  - The last 3 cycle-release markers across all specs (most recent first),
    each with spec name, agent, sha, and timestamp.

WHEN invoked with `--spec <name>`,
THE SYSTEM SHALL return that spec's frontmatter, `handoff.md`, and the
**most recent completed cycle** from `.log.md` (K=1 default per GCC
convention).

WHEN invoked with `--log <name> [--offset N]`,
THE SYSTEM SHALL return the **N-th most recent completed cycle** from
`specs/<name>/.log.md` (offset 0 = current/most recent; offset 1 = one
back; etc.). If the offset exceeds the number of complete cycles in the
file, exit non-zero with a message that points at `git log specs/<name>/.log.md`
for older state.

WHEN invoked with `--metadata <name> [<key>]`,
THE SYSTEM SHALL return targeted frontmatter — the full frontmatter if
`<key>` is omitted, or the single value if specified. Agents fetching just
`status` or `blocked_by` should not need to read the whole spec.

ALL `zettelgeist context` modes SHALL also be available as an MCP tool
(`context` with the same args), returning structured JSON.

### Narrative roadmap convention in `INDEX.md` (non-normative)

`INDEX.md`'s human region (above the `<!-- ZETTELGEIST:AUTO-GENERATED
BELOW -->` delimiter) SHALL be documented in `SKILL.md` with a
recommended structure: `## Goal`, `## Active milestones`, `## Now / Next /
Later`. The auto-region remains as v0.2 §9 defines it; this is a
convention agents follow, not a format rule.

### Spec amendment (v0.3 §9.4, normative additive)

`spec/zettelgeist-v0.1.md` SHALL gain §9.4 documenting the `.log.md` file
format (per-line entry shape, cycle markers, rotation semantics). The §9.4
content is normative additive: a spec folder without `.log.md` is still
valid; v0.2 readers ignore the file (dotfile, walker-excluded).

This is a pre-1.0 spec break. The format version stays at 0.2 — the .log.md
addition is additive surface, not a change to existing rules.

## Non-goals

- **LLM calls on the MCP write path.** Rotation is by count, not by
  summarisation. Cycles are dropped whole; no fold operation.
- **`--commit <sha>` flag.** Every cycle release marker carries `sha=...`
  in plain text. Agents who need to locate a specific commit's cycle can
  `grep "sha=<sha>" specs/*/.log.md` directly. We don't wrap this.
- **GCC's BRANCH/MERGE as reasoning trajectories.** Git branches + our
  merge drivers already cover the workspace-isolation use case for
  Zettelgeist's actual workload (multi-machine project work, not multi-
  hypothesis single-task reasoning).
- **Recursive-fold rolling summary in `handoff.md`.** The GCC paper's
  COMMIT operation regenerates a coarse-grained summary on every commit —
  that requires an LLM call. Out of scope for v0.3. `handoff.md` stays
  one-shot human-readable.
- **Formal benchmark gating (SWE-Bench, etc.).** SWE-Bench tests
  single-shot bug-fixing, which is the opposite of Zettelgeist's value
  prop (multi-session, multi-agent, multi-day project work). Dogfood v0.3
  on Zettelgeist's own development; ship on real-usage signal.

## Open questions

1. **Should `.log.md` entries record the action's effect or just the call?**
   Today's proposal: `tick_task(2)` (the call). Alternative: `tick_task(2)
   → "add JWT validation" → [x]` (the effect). Effect is more useful for
   the resuming agent but means the log embeds tasks.md content, which
   could go stale if the task text is later edited. Proposed default: call
   only; effect can be reconstructed by reading tasks.md at the cycle's
   release sha if needed.

2. **Rotation cap: 50 cycles per spec or per repo?** Proposal is per-spec
   (each `.log.md` independent). Per-repo would require a global accounting
   layer; per-spec is simpler and aligned with how cycles are scoped.

3. **`context --log` with no offset on an in-progress cycle.** Should it
   return the (incomplete) current cycle or the most recent *completed*
   one? Proposal: current if a cycle is open, completed otherwise. Open
   cycles are the most actionable for a resuming agent.
